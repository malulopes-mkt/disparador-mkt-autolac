export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const template = await prisma.template.findUnique({ where: { id } })
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const data: Record<string, string | null> = {}
  if ('headerMediaUrl' in body) {
    data.headerMediaUrl = body.headerMediaUrl || null
  }

  const updated = await prisma.template.update({ where: { id }, data })
  return NextResponse.json(updated)
}
