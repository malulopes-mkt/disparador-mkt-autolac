'use client'

import { useEffect, useState } from 'react'
import StatsCard from '@/components/StatsCard'
import StatusBadge from '@/components/StatusBadge'
import { formatPhoneDisplay, timeAgo } from '@/lib/utils'

interface DashboardData {
  sentToday: number
  sentWeek: number
  sentMonth: number
  deliveryRate: number
  responseRate: number
  failedMonth: number
  activeTriggers: number
  recentMessages: {
    id: string
    contactPhone: string
    contactName: string | null
    templateName: string | null
    status: string
    timestamp: string
  }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />
  if (!data) return <p className="text-gray-500">Erro ao carregar dados</p>

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest text-blue-300 mb-4" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)' }}>
          WhatsApp MKT
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient">Dashboard</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2">Visao geral dos disparos WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Enviadas Hoje"
          value={data.sentToday}
          subtitle={`${data.sentWeek} esta semana`}
          icon={<SendIcon />}
        />
        <StatsCard
          label="Enviadas no Mes"
          value={data.sentMonth}
          subtitle={`${data.failedMonth} falharam`}
          icon={<CalendarIcon />}
        />
        <StatsCard
          label="Taxa de Entrega"
          value={`${data.deliveryRate}%`}
          subtitle="Entregues + Lidas"
          icon={<CheckIcon />}
        />
        <StatsCard
          label="Taxa de Resposta"
          value={`${data.responseRate}%`}
          subtitle={`${data.activeTriggers} gatilhos ativos`}
          icon={<ReplyIcon />}
        />
      </div>

      <div className="glass-card">
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
          <h2 className="font-semibold text-white text-sm">Ultimas Mensagens Enviadas</h2>
        </div>
        <div>
          {data.recentMessages.length === 0 && (
            <p className="px-5 py-8 text-center text-gray-600 text-sm">Nenhuma mensagem enviada ainda</p>
          )}
          {data.recentMessages.map((msg, i) => (
            <div key={msg.id} className="px-5 py-3 flex items-center justify-between transition-colors hover:bg-white/[0.02]" style={i < data.recentMessages.length - 1 ? { borderBottom: '1px solid var(--glass-border)' } : {}}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-blue-300 shrink-0" style={{ background: 'rgba(37,99,235,0.15)' }}>
                  {(msg.contactName || msg.contactPhone)[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {msg.contactName || formatPhoneDisplay(msg.contactPhone)}
                  </p>
                  <p className="text-xs text-gray-600">{msg.templateName || 'Mensagem'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={msg.status} />
                <span className="text-xs text-gray-600">{timeAgo(new Date(msg.timestamp))}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
    </svg>
  )
}
