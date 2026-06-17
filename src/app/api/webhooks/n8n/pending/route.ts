export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
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
