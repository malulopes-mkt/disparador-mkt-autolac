export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendTemplate, buildHeaderComponent, TemplateComponent } from '@/lib/whatsapp'
import { normalizePhone, isInternalPhone } from '@/lib/utils'
import { getSetting } from '@/lib/settings'
import { createCommunicationNote, getContactDeals } from '@/lib/hubspot'

const HUBSPOT_API = 'https://api.hubapi.com'
const DELAY_BETWEEN_MESSAGES_MS = 1500

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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trigger = await prisma.trigger.findUnique({ where: { id } })
  if (!trigger) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!trigger.segmentId) {
    return NextResponse.json({ error: 'No segment configured for this campaign' }, { status: 400 })
  }

  const isResuming = trigger.status === 'running'

  const token = await getSetting('HUBSPOT_ACCESS_TOKEN')
  if (!token) {
    return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const contacts = await fetchListContacts(trigger.segmentId, token)

  const alreadySentPhones = new Set<string>()
  if (isResuming) {
    const alreadySent = await prisma.message.findMany({
      where: { triggerId: id, direction: 'outbound' },
      select: { contactPhone: true },
    })
    for (const m of alreadySent) {
      alreadySentPhones.add(m.contactPhone)
    }
  }

  const previousSent = isResuming ? (trigger.sentCount || 0) : 0
  const previousFailed = isResuming ? (trigger.failedCount || 0) : 0

  await prisma.trigger.update({
    where: { id },
    data: {
      status: 'running',
      totalContacts: contacts.length,
      ...(!isResuming && { sentCount: 0, failedCount: 0 }),
    },
  })

  const dbTemplate = await prisma.template.findFirst({
    where: { name: trigger.templateName, status: 'APPROVED' },
  })
  const templateBody = dbTemplate?.bodyText || `[Template: ${trigger.templateName}]`
  const templateLanguage = dbTemplate?.language || 'pt_BR'

  const components: TemplateComponent[] = []
  if (dbTemplate) {
    const headerComp = buildHeaderComponent(dbTemplate.componentsJson, dbTemplate.headerMediaUrl)
    if (headerComp) components.push(headerComp)
  }

  let sent = previousSent
  let failed = previousFailed
  let skipped = 0

  for (const contact of contacts) {
    try {
      const normalizedPhone = normalizePhone(contact.phone)

      if (await isInternalPhone(normalizedPhone)) continue

      if (alreadySentPhones.has(normalizedPhone)) {
        skipped++
        continue
      }

      const result = await sendTemplate(normalizedPhone, trigger.templateName, templateLanguage, components.length > 0 ? components : undefined)
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
      where: { id },
      data: { sentCount: sent, failedCount: failed },
    })

    if (contacts.indexOf(contact) < contacts.length - 1) {
      await sleep(DELAY_BETWEEN_MESSAGES_MS)
    }
  }

  await prisma.trigger.update({
    where: { id },
    data: { status: 'completed', sentCount: sent, failedCount: failed },
  })

  return NextResponse.json({
    ok: true,
    campaign: trigger.name,
    totalContacts: contacts.length,
    sent,
    failed,
    skipped,
    resumed: isResuming,
  })
}
