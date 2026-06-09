import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trigger = await prisma.trigger.findUnique({ where: { id } })
  if (!trigger) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(trigger)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.description !== undefined) data.description = body.description
  if (body.hubspotEventType !== undefined) data.hubspotEventType = body.hubspotEventType
  if (body.hubspotProperty !== undefined) data.hubspotProperty = body.hubspotProperty || null
  if (body.hubspotValue !== undefined) data.hubspotValue = body.hubspotValue || null
  if (body.templateName !== undefined) data.templateName = body.templateName
  if (body.active !== undefined) data.active = body.active
  if (body.variableMapping !== undefined) data.variableMapping = JSON.stringify(body.variableMapping)

  const trigger = await prisma.trigger.update({ where: { id }, data })
  return NextResponse.json(trigger)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.trigger.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
