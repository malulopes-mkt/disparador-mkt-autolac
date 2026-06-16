export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendTemplate } from '@/lib/whatsapp'
import { normalizePhone, isInternalPhone } from '@/lib/utils'
import { getSetting } from '@/lib/settings'
import { createCommunicationNote, getContactDeals } from '@/lib/hubspot'

const HUBSPOT_API = 'https://api.hubapi.com'
const DELAY_BETWEEN_MESSAGES_MS = 1500

async function verifyAuth(req: NextRequest): Promise<boolean> {
  const tokenHeader = req.headers.get('x-webhook-token')
  if (!tokenHeader) return false
  const expectedToken = await getSetting('N8N_WEBHOOK_TOKEN')
  if (!expectedToken) return false
  return tokenHeader === expectedToken
}

async function fetchListContacts(listId: string, token: string) {
  const contacts: { id: string; phone: string; name: string | null }[] = []
  let hasMore = true
  let vidOffset = 0

  while (hasMore) {
    const url = `${HUBSPOT_API}/contacts/v1/lists/${listId}/contacts/all?count=100&vidOffset=${vidOffset}&property=phone&property=mobilephone&property=hs_whatsapp_phone_number&property=firstname&property=lastname`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) break

    const data = await res.json()
    for (const c of data.contacts || []) {
      const phone = c.properties?.phone?.value ||
        c.properties?.mobilephone?.value ||
        c.properties?.hs_whatsapp_phone_number?.value || ''
      if (!phone) continue

      const firstName = c.properties?.firstname?.value || ''
      const lastName = c.properties?.lastname?.value || ''
      const name = [firstName, lastName].filter(Boolean).join(' ') || null

      contacts.push({ id: String(c.vid), phone, name })
    }

    hasMore = data['has-more'] === true
    vidOffset = data['vid-offset'] || 0
  }

  return contacts
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const isN8N = await verifyAuth(req)
  if (!isN8N) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const trigger = await prisma.trigger.findUnique({ where: { id } })
  if (!trigger) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!trigger.segmentId) {
    return NextResponse.json({ error: 'No segment configured for this campaign' }, { status: 400 })
  }

  if (trigger.status === 'running') {
    return NextResponse.json({ error: 'Campaign is already running' }, { status: 409 })
  }

  const token = await getSetting('HUBSPOT_ACCESS_TOKEN')
  if (!token) {
    return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const contacts = await fetchListContacts(trigger.segmentId, token)

  await prisma.trigger.update({
    where: { id },
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
  })
}
