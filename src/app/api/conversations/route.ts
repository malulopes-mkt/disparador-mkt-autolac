export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizePhone } from '@/lib/utils'
import { getPhoneNumberDisplay } from '@/lib/whatsapp'

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search') || ''

  const allMessages = await prisma.message.findMany({
    orderBy: { timestamp: 'desc' },
    ...(search
      ? {
          where: {
            OR: [
              { contactPhone: { contains: search } },
              { contactName: { contains: search } },
            ],
          },
        }
      : {}),
  })

  const conversationMap = new Map<
    string,
    {
      phone: string
      name: string | null
      lastMessage: string
      lastTimestamp: Date
      direction: string
      totalMessages: number
      inboundCount: number
      outboundCount: number
      receivedOnIds: Set<string>
    }
  >()

  for (const msg of allMessages) {
    const normalized = normalizePhone(msg.contactPhone)
    const existing = conversationMap.get(normalized)
    if (!existing) {
      conversationMap.set(normalized, {
        phone: normalized,
        name: msg.contactName,
        lastMessage: msg.body,
        lastTimestamp: msg.timestamp,
        direction: msg.direction,
        totalMessages: 1,
        inboundCount: msg.direction === 'inbound' ? 1 : 0,
        outboundCount: msg.direction === 'outbound' ? 1 : 0,
        receivedOnIds: new Set(msg.receivedOnPhoneId ? [msg.receivedOnPhoneId] : []),
      })
    } else {
      existing.totalMessages++
      if (msg.direction === 'inbound') existing.inboundCount++
      else existing.outboundCount++
      if (!existing.name && msg.contactName) existing.name = msg.contactName
      if (msg.receivedOnPhoneId) existing.receivedOnIds.add(msg.receivedOnPhoneId)
    }
  }

  // Resolve each phone_number_id to its display number (cached in-memory)
  const distinctIds = new Set<string>()
  for (const conv of conversationMap.values()) {
    for (const id of conv.receivedOnIds) distinctIds.add(id)
  }
  const idToDisplay = new Map<string, string>()
  for (const id of distinctIds) {
    const display = await getPhoneNumberDisplay(id).catch(() => null)
    idToDisplay.set(id, display || `ID ${id.slice(-6)}`)
  }

  const conversations = Array.from(conversationMap.values())
    .map(({ receivedOnIds, ...conv }) => ({
      ...conv,
      numbers: Array.from(receivedOnIds).map(id => idToDisplay.get(id) || id),
    }))
    .sort((a, b) => b.lastTimestamp.getTime() - a.lastTimestamp.getTime())

  return NextResponse.json(conversations)
}
