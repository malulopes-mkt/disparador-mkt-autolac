export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getWABAAnalytics, getTemplateAnalytics } from '@/lib/whatsapp'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  let startDate: Date
  let endDate: Date

  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  if (startParam && endParam) {
    startDate = new Date(startParam)
    endDate = new Date(endParam)
  } else {
    const days = parseInt(searchParams.get('days') || '30', 10)
    endDate = new Date()
    startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
  }

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  const dbTemplates = await prisma.template.findMany({
    where: { status: 'APPROVED' },
    select: { metaTemplateId: true, name: true },
  })
  const templateIds = dbTemplates.map(t => t.metaTemplateId)
  const templateNameMap = new Map(dbTemplates.map(t => [t.metaTemplateId, t.name]))

  // Meta API limits template_ids to 10 per request — batch in chunks
  const CHUNK_SIZE = 10
  const templateChunks: string[][] = []
  for (let i = 0; i < templateIds.length; i += CHUNK_SIZE) {
    templateChunks.push(templateIds.slice(i, i + CHUNK_SIZE))
  }

  const [analytics, ...templateResults] = await Promise.all([
    getWABAAnalytics(startDate, endDate, diffDays <= 1 ? 'HALF_HOUR' : 'DAY'),
    ...templateChunks.map(chunk => getTemplateAnalytics(startDate, endDate, chunk)),
  ])

  const templateAnalytics = {
    dataPoints: templateResults.flatMap(r => r?.dataPoints || []),
  }

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

  let totalRead = 0
  let totalClicked = 0
  const templates: {
    name: string
    sent: number
    delivered: number
    read: number
    clicked: number
    deliveryRate: number
    readRate: number
    clickRate: number
  }[] = []

  if (templateAnalytics?.dataPoints) {
    for (const tp of templateAnalytics.dataPoints) {
      const clickCount = Array.isArray(tp.clicked)
        ? tp.clicked.reduce((a: number, b: number) => a + b, 0)
        : (typeof tp.clicked === 'number' ? tp.clicked : 0)

      totalRead += tp.read
      totalClicked += clickCount

      templates.push({
        name: templateNameMap.get(tp.templateId) || tp.templateName || tp.templateId,
        sent: tp.sent,
        delivered: tp.delivered,
        read: tp.read,
        clicked: clickCount,
        deliveryRate: tp.sent > 0 ? Math.round((tp.delivered / tp.sent) * 100) : 0,
        readRate: tp.delivered > 0 ? Math.round((tp.read / tp.delivered) * 100) : 0,
        clickRate: tp.delivered > 0 ? Math.round((clickCount / tp.delivered) * 100) : 0,
      })
    }
    templates.sort((a, b) => b.sent - a.sent)
  }

  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0
  const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0
  const clickRate = totalDelivered > 0 ? Math.round((totalClicked / totalDelivered) * 100) : 0

  const errors = totalSent - totalDelivered

  return NextResponse.json({
    period: { start: startDate.toISOString(), end: endDate.toISOString(), days: diffDays },
    totals: {
      sent: totalSent,
      delivered: totalDelivered,
      read: totalRead,
      clicked: totalClicked,
      deliveryRate,
      readRate,
      clickRate,
      errors,
    },
    daily: dailyData,
    templates,
    available: analytics !== null,
  })
}
