export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const RATES_BRL: Record<string, number> = {
  MARKETING: 0.0625,
  'MARKETING-LITE': 0.0195,
  UTILITY: 0.0080,
  AUTHENTICATION: 0.0315,
  'AUTHENTICATION-INTERNATIONAL': 0.0900,
  SERVICE: 0.0300,
}

const FREE_SERVICE_LIMIT = 1000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  let startDate: Date
  let endDate: Date

  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  if (startParam && endParam) {
    startDate = new Date(startParam + 'T00:00:00Z')
    endDate = new Date(endParam + 'T23:59:59Z')
  } else {
    endDate = new Date()
    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  }

  const [outboundMessages, inboundCount, templates] = await Promise.all([
    prisma.message.findMany({
      where: {
        direction: 'outbound',
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { templateName: true, status: true },
    }),
    prisma.message.count({
      where: {
        direction: 'inbound',
        timestamp: { gte: startDate, lte: endDate },
      },
    }),
    prisma.template.findMany({
      select: { name: true, category: true },
    }),
  ])

  const categoryMap = new Map(templates.map(t => [t.name, t.category.toUpperCase()]))

  const sentByCategory: Record<string, number> = {}
  const deliveredByCategory: Record<string, number> = {}
  let totalSent = 0
  let totalDelivered = 0

  for (const msg of outboundMessages) {
    const category = (msg.templateName && categoryMap.get(msg.templateName)) || 'MARKETING'
    totalSent++
    sentByCategory[category] = (sentByCategory[category] || 0) + 1

    if (msg.status === 'delivered' || msg.status === 'read') {
      totalDelivered++
      deliveredByCategory[category] = (deliveredByCategory[category] || 0) + 1
    }
  }

  const serviceDelivered = deliveredByCategory['SERVICE'] || 0
  const freeService = Math.min(serviceDelivered, FREE_SERVICE_LIMIT)
  const paidService = Math.max(0, serviceDelivered - FREE_SERVICE_LIMIT)

  const categories = [
    'MARKETING', 'MARKETING-LITE', 'UTILITY',
    'AUTHENTICATION', 'AUTHENTICATION-INTERNATIONAL', 'SERVICE',
  ]

  const deliveredBreakdown = categories.map(cat => ({
    category: cat,
    delivered: deliveredByCategory[cat] || 0,
  }))

  const freeBreakdown = [
    { category: 'Atendimento ao cliente gratis', count: freeService },
    { category: 'Ponto de entrada gratuito', count: 0 },
  ]

  const paidBreakdown = categories
    .filter(cat => cat !== 'SERVICE')
    .map(cat => ({
      category: cat,
      delivered: deliveredByCategory[cat] || 0,
    }))
  if (paidService > 0) {
    paidBreakdown.push({ category: 'SERVICE', delivered: paidService })
  }

  const totalFree = freeService
  const totalPaid = totalDelivered - totalFree

  let totalCost = 0
  const costBreakdown = categories.map(cat => {
    const delivered = deliveredByCategory[cat] || 0
    let billable = delivered
    if (cat === 'SERVICE') billable = paidService
    const cost = billable * (RATES_BRL[cat] || 0)
    totalCost += cost
    return { category: cat, cost: Math.round(cost * 100) / 100 }
  }).filter(c => c.cost > 0 || (deliveredByCategory[c.category] || 0) > 0)

  return NextResponse.json({
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      sent: totalSent,
      delivered: totalDelivered,
      received: inboundCount,
    },
    deliveredBreakdown,
    freeMessages: { total: totalFree, breakdown: freeBreakdown },
    paidMessages: { total: totalPaid, breakdown: paidBreakdown },
    cost: {
      total: Math.round(totalCost * 100) / 100,
      breakdown: costBreakdown,
    },
  })
}
