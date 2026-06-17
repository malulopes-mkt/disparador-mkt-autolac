export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSetting } from '@/lib/settings'

export async function GET(req: NextRequest) {
  const tokenHeader = req.headers.get('x-webhook-token')
  if (!tokenHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const expectedToken = await getSetting('N8N_WEBHOOK_TOKEN')
  if (!expectedToken || tokenHeader !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    select: {
      id: true,
      name: true,
      templateName: true,
      segmentId: true,
      segmentName: true,
      scheduledAt: true,
    },
  })

  return NextResponse.json({ pending, count: pending.length })
}
