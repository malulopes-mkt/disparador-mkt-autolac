export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getWABAAnalytics, getTemplateAnalytics } from '@/lib/whatsapp'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '30', 10)

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const [analytics, templateAnalytics] = await Promise.all([
    getWABAAnalytics(startDate, endDate, days <= 1 ? 'HALF_HOUR' : 'DAY'),
    getTemplateAnalytics(startDate, endDate),
  ])

  let totalSent = 0
  let totalDelivered = 0
  const dailyData: { date: string; sent: number; delivered: number }[] = []

  if (analytics?.dataPoints) {
    for (const dp of analytics.dataPoints) {
      totalSent += dp.sent
      totalDelivered += dp.delivered
      dailyData.push({
        date: new Date(dp.start * 1000).toISOString().split('T')[0],
        sent: dp.sent,
        delivered: dp.delivered,
      })
    }
  }

  const templates: {
    name: string
    sent: number
    delivered: number
    read: number
    deliveryRate: number
    readRate: number
  }[] = []

  if (templateAnalytics?.dataPoints) {
    for (const tp of templateAnalytics.dataPoints) {
      templates.push({
        name: tp.templateName,
        sent: tp.sent,
        delivered: tp.delivered,
        read: tp.read,
        deliveryRate: tp.sent > 0 ? Math.round((tp.delivered / tp.sent) * 100) : 0,
        readRate: tp.delivered > 0 ? Math.round((tp.read / tp.delivered) * 100) : 0,
      })
    }
    templates.sort((a, b) => b.sent - a.sent)
  }

  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0

  return NextResponse.json({
    period: { start: startDate.toISOString(), end: endDate.toISOString(), days },
    totals: { sent: totalSent, delivered: totalDelivered, deliveryRate },
    daily: dailyData,
    templates,
    available: analytics !== null,
  })
}
