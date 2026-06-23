export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWebhook, verifyWebhookSignature, parseWebhookPayload } from '@/lib/whatsapp'
import { searchContactByPhone, createCommunicationNote } from '@/lib/hubspot'
import { normalizePhone, isInternalPhone } from '@/lib/utils'
import { classifyConversation } from '@/lib/classify'

// Bloqueante #10: Limite de tamanho do body (1MB)
const MAX_BODY_SIZE = 1_000_000

export async function GET(req: NextRequest) {
  const challenge = await verifyWebhook(req.nextUrl.searchParams)
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  // Bloqueante #10: Rejeitar body muito grande
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  // Bloqueante #1: Ler raw body e validar HMAC antes de processar
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const signature = req.headers.get('x-hub-signature-256')
  const isValid = await verifyWebhookSignature(rawBody, signature)
  if (!isValid) {
    console.error('Webhook signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody)
    const { messages, statuses } = parseWebhookPayload(body)

    for (const msg of messages) {
      // Bloqueante #5: Idempotência — checar waMessageId ANTES de processar
      if (msg.id) {
        const existing = await prisma.message.findUnique({
          where: { waMessageId: msg.id },
        })
        if (existing) continue // Mensagem já processada, pular
      }

      const phone = normalizePhone(msg.from)
      if (await isInternalPhone(phone)) continue

      const mediaObj = msg.audio || msg.image || msg.video || msg.document || msg.sticker
      const mediaType = mediaObj ? msg.type : null
      const mediaId = mediaObj?.id || null
      const caption = (msg.image?.caption || msg.video?.caption || msg.document?.caption)
      const text = msg.text?.body || caption || `[${msg.type}]`

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
          mediaType,
          mediaId,
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
    // Bloqueante #4: Retornar 500 em erro interno (Meta retenta)
    console.error('WhatsApp webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
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
