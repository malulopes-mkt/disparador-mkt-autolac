import { prisma } from './db'
import { sendTemplate } from './whatsapp'
import { normalizePhone, isInternalPhone } from './utils'
import { getSetting } from './settings'
import { createCommunicationNote, getContactDeals } from './hubspot'

const HUBSPOT_API = 'https://api.hubapi.com'
const DELAY_BETWEEN_MESSAGES_MS = 1500
const POLL_INTERVAL_MS = 2 * 60 * 1000

let running = false

async function fetchListContacts(listId: string, token: string) {
  const contacts: { id: string; phone: string; name: string | null }[] = []
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const memberIds: string[] = []
  let after: string | undefined

  while (true) {
    const url = `${HUBSPOT_API}/crm/v3/lists/${listId}/memberships?limit=100${after ? `&after=${after}` : ''}`
    const res = await fetch(url, { headers })
    if (!res.ok) break
    const data = await res.json()
    for (const m of data.results || []) {
      memberIds.push(String(m.recordId || m))
    }
    if (!data.paging?.next?.after) break
    after = data.paging.next.after
  }

  const BATCH_SIZE = 100
  for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
    const batch = memberIds.slice(i, i + BATCH_SIZE)
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/batch/read`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: ['phone', 'mobilephone', 'hs_whatsapp_phone_number', 'firstname', 'lastname'],
        inputs: batch.map(id => ({ id })),
      }),
    })
    if (!res.ok) continue
    const data = await res.json()
    for (const c of data.results || []) {
      const phone = c.properties?.phone || c.properties?.mobilephone || c.properties?.hs_whatsapp_phone_number || ''
      if (!phone) continue
      const firstName = c.properties?.firstname || ''
      const lastName = c.properties?.lastname || ''
      const name = [firstName, lastName].filter(Boolean).join(' ') || null
      contacts.push({ id: c.id, phone, name })
    }
  }

  return contacts
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function executeCampaign(triggerId: string) {
  const trigger = await prisma.trigger.findUnique({ where: { id: triggerId } })
  if (!trigger || !trigger.segmentId || trigger.status === 'running') return

  const token = await getSetting('HUBSPOT_ACCESS_TOKEN')
  if (!token) {
    console.error('[campaign-scheduler] HUBSPOT_ACCESS_TOKEN not configured')
    return
  }

  console.log(`[campaign-scheduler] Executing campaign "${trigger.name}" (${triggerId})`)

  const contacts = await fetchListContacts(trigger.segmentId, token)

  await prisma.trigger.update({
    where: { id: triggerId },
    data: { status: 'running', totalContacts: contacts.length, sentCount: 0, failedCount: 0 },
  })

  const dbTemplate = await prisma.template.findFirst({
    where: { name: trigger.templateName, status: 'APPROVED' },
  })
  const templateBody = dbTemplate?.bodyText || `[Template: ${trigger.templateName}]`
  const templateLanguage = dbTemplate?.language || 'pt_BR'

  let sent = 0
  let failed = 0

  for (const contact of contacts) {
    try {
      const normalizedPhone = normalizePhone(contact.phone)
      if (await isInternalPhone(normalizedPhone)) continue

      const result = await sendTemplate(normalizedPhone, trigger.templateName, templateLanguage)
      const waMessageId = result.messages?.[0]?.id || null

      await prisma.message.create({
        data: {
          contactPhone: normalizedPhone,
          contactName: contact.name,
          direction: 'outbound',
          templateName: trigger.templateName,
          body: templateBody,
          status: 'sent',
          hubspotContactId: contact.id,
          triggerId: trigger.id,
          waMessageId,
        },
      })

      if (contact.id) {
        const dealId = await getContactDeals(contact.id).catch(() => null)
        const noteBody = `<p><strong>WhatsApp Campanha:</strong> ${trigger.name}</p><p><strong>Template:</strong> ${trigger.templateName}</p><p>Para: ${normalizedPhone}</p>`
        createCommunicationNote(contact.id, noteBody, dealId || undefined).catch(() => {})
      }

      sent++
    } catch (err) {
      failed++
      const normalizedPhone = normalizePhone(contact.phone)
      await prisma.message.create({
        data: {
          contactPhone: normalizedPhone,
          contactName: contact.name,
          direction: 'outbound',
          templateName: trigger.templateName,
          body: templateBody,
          status: 'failed',
          failReason: err instanceof Error ? err.message : String(err),
          hubspotContactId: contact.id,
          triggerId: trigger.id,
        },
      }).catch(() => {})
    }

    await prisma.trigger.update({
      where: { id: triggerId },
      data: { sentCount: sent, failedCount: failed },
    })

    if (contacts.indexOf(contact) < contacts.length - 1) {
      await sleep(DELAY_BETWEEN_MESSAGES_MS)
    }
  }

  await prisma.trigger.update({
    where: { id: triggerId },
    data: { status: 'completed', sentCount: sent, failedCount: failed },
  })

  console.log(`[campaign-scheduler] Campaign "${trigger.name}" completed: ${sent} sent, ${failed} failed`)
}

async function pollAndExecute() {
  if (running) return
  running = true

  try {
    const now = new Date()
    const pending = await prisma.trigger.findMany({
      where: {
        status: 'scheduled',
        segmentId: { not: null },
        active: true,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      },
      select: { id: true, name: true },
    })

    if (pending.length > 0) {
      console.log(`[campaign-scheduler] Found ${pending.length} pending campaign(s)`)
    }

    for (const campaign of pending) {
      await executeCampaign(campaign.id)
    }
  } catch (err) {
    console.error('[campaign-scheduler] Poll error:', err)
  } finally {
    running = false
  }
}

export function startCampaignScheduler() {
  console.log('[campaign-scheduler] Starting (poll every 2 minutes)')
  pollAndExecute()
  setInterval(pollAndExecute, POLL_INTERVAL_MS)
}
