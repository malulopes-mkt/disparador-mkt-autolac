import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const phone = searchParams.get('phone')
  const direction = searchParams.get('direction')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '50')))

  const where: Record<string, unknown> = {}
  if (phone) where.contactPhone = phone
  if (direction) where.direction = direction
  if (from || to) {
    where.timestamp = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where }),
  ])

  return NextResponse.json({
    messages,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
