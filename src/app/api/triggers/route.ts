export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const triggers = await prisma.trigger.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  })
  return NextResponse.json(triggers)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, description, hubspotEventType, hubspotProperty, hubspotValue, templateName, variableMapping, segmentId, segmentName, scheduledAt } = body

  if (!name || !hubspotEventType || !templateName) {
    return NextResponse.json({ error: 'name, hubspotEventType, and templateName are required' }, { status: 400 })
  }

  let status = 'active'
  if (segmentId) {
    status = 'scheduled'
  }

  const trigger = await prisma.trigger.create({
    data: {
      name,
      description: description || '',
      hubspotEventType,
      hubspotProperty: hubspotProperty || null,
      hubspotValue: hubspotValue || null,
      templateName,
      variableMapping: variableMapping ? JSON.stringify(variableMapping) : '{}',
      segmentId: segmentId || null,
      segmentName: segmentName || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status,
    },
  })

  return NextResponse.json(trigger, { status: 201 })
}
