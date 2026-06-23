export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizePhone } from '@/lib/utils'

export async function POST() {
  try {
    const messages = await prisma.message.findMany({
      select: { id: true, contactPhone: true },
    })

    let updated = 0
    for (const msg of messages) {
      const normalized = normalizePhone(msg.contactPhone)
      if (normalized !== msg.contactPhone) {
        await prisma.message.update({
          where: { id: msg.id },
          data: { contactPhone: normalized },
        })
        updated++
      }
    }

    return NextResponse.json({ ok: true, total: messages.length, updated })
  } catch (err) {
    console.error('Phone normalization error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
