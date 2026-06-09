import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWebhook, parseWebhookPayload } from '@/lib/whatsapp'
import { searchContactByPhone, createCommunicationNote } from '@/lib/hubspot'
import { normalizePhone, isInternalPhone } from '@/lib/utils'
import { classifyConversation } from '@/lib/classify'

export async function GET(req: NextRequest) {
  const challenge = await verifyWebhook(req.nextUrl.searchParams)
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, statuses } = parseWebhookPayload(body)

    for (const msg of messages) {
      const phone = normalizePhone(msg.from)
      if (await isInternalPhone(phone)) continue

      const text = msg.text?.body || `[${msg.type}]`

      let contactName: string | null = null
      let hubspotContactId: string | null = null

      const lastOutbound = await prisma.message.findFirst({
        where: { contactPhone: phone, direction: 'outbound' },
        orderBy: { timestamp: 'desc' },
      })

      if (lastOutbound) {
        contactName = lastOutbound.contactName
        hubspotContactId = lastOutbound.hubspotContactId
      }

      if (!hubspotContactId) {
        const contact = await searchContactByPhone(phone).catch(() => null)
        if (contact) {
          hubspotContactId = contact.id
          contactName = contactName || [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || null
        }
      }

      const inboundMsg = await prisma.message.create({
        data: {
          contactPhone: phone,
          contactName,
          direction: 'inbound',
          body: text,
          status: 'received',
          hubspotContactId,
          waMessageId: msg.id,
          timestamp: new Date(Number(msg.timestamp) * 1000),
        },
      })

      // Classify the conversation asynchronously
      classifyConversationAsync(phone, inboundMsg.id)

      if (hubspotContactId) {
        const noteBody = `<p><strong>Resposta WhatsApp recebida:</strong></p><p>${text}</p><p>De: ${phone}</p>`
        createCommunicationNote(hubspotContactId, noteBody).catch(console.error)
      }
    }

    for (const status of statuses) {
      if (!status.id) continue
      const existing = await prisma.message.findUnique({
        where: { waMessageId: status.id },
      })
      if (existing) {
        const failReason = status.errors?.map(e => e.title).join(', ') || null
        await prisma.message.update({
          where: { waMessageId: status.id },
          data: {
            status: status.status,
            ...(failReason ? { failReason } : {}),
          },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}

async function classifyConversationAsync(phone: string, messageId: string) {
  try {
    const recentMessages = await prisma.message.findMany({
      where: { contactPhone: phone },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { direction: true, body: true, timestamp: true },
    })

    if (recentMessages.length < 2) return

    const classification = await classifyConversation(recentMessages)
    if (!classification) return

    await prisma.message.update({
      where: { id: messageId },
      data: {
        classifyTipo: classification.tipo,
        classifyTom: classification.tom,
        classifyPontos: JSON.stringify(classification.pontos),
        classifyProximo: classification.proximosPasso,
      },
    })
  } catch (err) {
    console.error('Async classification error:', err)
  }
}
