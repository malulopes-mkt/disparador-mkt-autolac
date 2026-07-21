export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendText } from '@/lib/whatsapp'
import { normalizePhone } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { phone, message } = body as { phone?: string; message?: string }

  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: 'phone and message are required' }, { status: 400 })
  }

  const normalizedPhone = normalizePhone(phone)

  try {
    // Reply from the same business number the customer's last message
    // arrived on, so the 24h session window applies to this send
    const lastInbound = await prisma.message.findFirst({
      where: { contactPhone: normalizedPhone, direction: 'inbound', receivedOnPhoneId: { not: null } },
      orderBy: { timestamp: 'desc' },
      select: { receivedOnPhoneId: true },
    })

    const result = await sendText(normalizedPhone, message.trim(), lastInbound?.receivedOnPhoneId || undefined)
    const waMessageId = result.messages?.[0]?.id || null

    const existing = await prisma.message.findFirst({
      where: { contactPhone: normalizedPhone },
      orderBy: { timestamp: 'desc' },
      select: { contactName: true, hubspotContactId: true },
    })

    const msg = await prisma.message.create({
      data: {
        contactPhone: normalizedPhone,
        contactName: existing?.contactName || null,
        direction: 'outbound',
        body: message.trim(),
        status: 'sent',
        waMessageId,
        hubspotContactId: existing?.hubspotContactId || null,
        timestamp: new Date(),
      },
    })

    return NextResponse.json({ ok: true, id: msg.id, waMessageId })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
