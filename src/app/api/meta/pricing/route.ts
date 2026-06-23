export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getWABAAnalytics } from '@/lib/whatsapp'

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

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  const [metaAnalytics, outboundMessages, inboundCount, templates] = await Promise.all([
    getWABAAnalytics(startDate, endDate, diffDays <= 1 ? 'HALF_HOUR' : 'DAY'),
    prisma.message.findMany({
      where: {
        direction: 'outbound',
        timestamp: { gte: startDate, lte: endDate },
        status: { not: 'failed' },
      },
      select: { templateName: true },
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

  let metaSent = 0
  let metaDelivered = 0
  if (metaAnalytics?.dataPoints) {
    for (const dp of metaAnalytics.dataPoints) {
      metaSent += dp.sent
      metaDelivered += dp.delivered
    }
  }

  const categoryMap = new Map(templates.map(t => [t.name, t.category.toUpperCase()]))

  const sentByCategory: Record<string, number> = {}
  let dbSentTotal = 0

  for (const msg of outboundMessages) {
    const category = (msg.templateName && categoryMap.get(msg.templateName)) || 'MARKETING'
    dbSentTotal++
    sentByCategory[category] = (sentByCategory[category] || 0) + 1
  }

  const totalSent = metaSent || dbSentTotal
  const deliveryRate = totalSent > 0 && metaDelivered > 0
    ? metaDelivered / metaSent
    : 0.98

  const totalDelivered = metaDelivered || Math.round(dbSentTotal * deliveryRate)

  const deliveredByCategory: Record<string, number> = {}
  for (const cat of Object.keys(sentByCategory)) {
    deliveredByCategory[cat] = Math.round((sentByCategory[cat] || 0) * deliveryRate)
  }

  const recalcDelivered = Object.values(deliveredByCategory).reduce((a, b) => a + b, 0)
  if (recalcDelivered !== totalDelivered && Object.keys(deliveredByCategory).length > 0) {
    const topCat = Object.entries(deliveredByCategory).sort((a, b) => b[1] - a[1])[0]
    if (topCat) deliveredByCategory[topCat[0]] += totalDelivered - recalcDelivered
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
