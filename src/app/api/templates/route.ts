export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const templates = await prisma.template.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(templates)
}
