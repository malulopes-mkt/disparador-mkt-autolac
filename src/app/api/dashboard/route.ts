import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    sentToday,
    sentWeek,
    sentMonth,
    deliveredMonth,
    readMonth,
    failedMonth,
    inboundMonth,
    uniqueOutboundContacts,
    uniqueInboundContacts,
    activeTriggers,
    recentMessages,
  ] = await Promise.all([
    prisma.message.count({
      where: { direction: 'outbound', timestamp: { gte: todayStart } },
    }),
    prisma.message.count({
      where: { direction: 'outbound', timestamp: { gte: weekStart } },
    }),
    prisma.message.count({
      where: { direction: 'outbound', timestamp: { gte: monthStart } },
    }),
    prisma.message.count({
      where: { direction: 'outbound', status: 'delivered', timestamp: { gte: monthStart } },
    }),
    prisma.message.count({
      where: { direction: 'outbound', status: 'read', timestamp: { gte: monthStart } },
    }),
    prisma.message.count({
      where: { direction: 'outbound', status: 'failed', timestamp: { gte: monthStart } },
    }),
    prisma.message.count({
      where: { direction: 'inbound', timestamp: { gte: monthStart } },
    }),
    prisma.message.groupBy({
      by: ['contactPhone'],
      where: { direction: 'outbound', timestamp: { gte: monthStart } },
    }),
    prisma.message.groupBy({
      by: ['contactPhone'],
      where: { direction: 'inbound', timestamp: { gte: monthStart } },
    }),
    prisma.trigger.count({ where: { active: true } }),
    prisma.message.findMany({
      where: { direction: 'outbound' },
      orderBy: { timestamp: 'desc' },
      take: 10,
    }),
  ])

  const totalOutbound = sentMonth
  const successfulDeliveries = deliveredMonth + readMonth
  const deliveryRate = totalOutbound > 0
    ? Math.round((successfulDeliveries / totalOutbound) * 100)
    : 0

  const outboundPhones = new Set(uniqueOutboundContacts.map(c => c.contactPhone))
  const inboundPhones = new Set(uniqueInboundContacts.map(c => c.contactPhone))
  const respondedCount = [...outboundPhones].filter(p => inboundPhones.has(p)).length
  const responseRate = outboundPhones.size > 0
    ? Math.round((respondedCount / outboundPhones.size) * 100)
    : 0

  return NextResponse.json({
    sentToday,
    sentWeek,
    sentMonth,
    deliveryRate,
    responseRate,
    failedMonth,
    activeTriggers,
    recentMessages,
  })
}
