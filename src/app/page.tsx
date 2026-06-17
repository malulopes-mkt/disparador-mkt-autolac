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

interface MetaInsights {
  period: { start: string; end: string; days: number }
  totals: { sent: number; delivered: number; deliveryRate: number }
  daily: { date: string; sent: number; delivered: number }[]
  templates: {
    name: string
    sent: number
    delivered: number
    read: number
    deliveryRate: number
    readRate: number
  }[]
  available: boolean
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [insights, setInsights] = useState<MetaInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [insightsDays, setInsightsDays] = useState(30)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch(`/api/meta/insights?days=${insightsDays}`)
      .then(r => r.json())
      .then(setInsights)
      .catch(() => setInsights(null))
  }, [insightsDays])

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

      {insights?.available && (
        <>
          <div className="glass-card mb-8">
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--glass-border)' }}>
              <div>
                <h2 className="font-semibold text-white text-sm">Insights Meta WhatsApp</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">Dados oficiais da API Meta Business</p>
              </div>
              <div className="flex gap-1">
                {[7, 15, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setInsightsDays(d)}
                    className="px-3 py-1 rounded text-xs transition-colors"
                    style={{
                      background: insightsDays === d ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${insightsDays === d ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      color: insightsDays === d ? '#93c5fd' : '#9ca3af',
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Enviadas (Meta)</p>
                <p className="text-2xl font-bold text-gradient mt-1">{insights.totals.sent.toLocaleString('pt-BR')}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Entregues (Meta)</p>
                <p className="text-2xl font-bold text-gradient mt-1">{insights.totals.delivered.toLocaleString('pt-BR')}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Taxa Entrega (Meta)</p>
                <p className="text-2xl font-bold text-gradient mt-1">{insights.totals.deliveryRate}%</p>
              </div>
            </div>

            {insights.daily.length > 0 && (
              <div className="px-5 pb-5">
                <MiniChart data={insights.daily} />
              </div>
            )}
          </div>

          {insights.templates.length > 0 && (
            <div className="glass-card mb-8">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
                <h2 className="font-semibold text-white text-sm">Performance por Template</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">Metricas de cada template nos ultimos {insightsDays} dias</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left font-medium">Template</th>
                      <th className="px-5 py-3 text-right font-medium">Enviadas</th>
                      <th className="px-5 py-3 text-right font-medium">Entregues</th>
                      <th className="px-5 py-3 text-right font-medium">Lidas</th>
                      <th className="px-5 py-3 text-right font-medium">Entrega %</th>
                      <th className="px-5 py-3 text-right font-medium">Leitura %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.templates.map(t => (
                      <tr key={t.name} className="border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'var(--glass-border)' }}>
                        <td className="px-5 py-3 text-gray-200 font-medium">{t.name}</td>
                        <td className="px-5 py-3 text-right text-gray-400">{t.sent.toLocaleString('pt-BR')}</td>
                        <td className="px-5 py-3 text-right text-gray-400">{t.delivered.toLocaleString('pt-BR')}</td>
                        <td className="px-5 py-3 text-right text-gray-400">{t.read.toLocaleString('pt-BR')}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={t.deliveryRate >= 90 ? 'text-emerald-400' : t.deliveryRate >= 70 ? 'text-yellow-400' : 'text-red-400'}>
                            {t.deliveryRate}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={t.readRate >= 50 ? 'text-emerald-400' : t.readRate >= 30 ? 'text-yellow-400' : 'text-red-400'}>
                            {t.readRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

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

function MiniChart({ data }: { data: { date: string; sent: number; delivered: number }[] }) {
  if (data.length === 0) return null

  const maxVal = Math.max(...data.map(d => d.sent), 1)
  const chartHeight = 120
  const barWidth = Math.max(4, Math.min(20, Math.floor(600 / data.length) - 2))

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(37,99,235,0.7)' }} />
          <span className="text-[10px] text-gray-500">Enviadas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(16,185,129,0.7)' }} />
          <span className="text-[10px] text-gray-500">Entregues</span>
        </div>
      </div>
      <div className="flex items-end gap-[2px] overflow-x-auto pb-1" style={{ height: chartHeight + 24 }}>
        {data.map((d, i) => {
          const sentH = (d.sent / maxVal) * chartHeight
          const deliveredH = (d.delivered / maxVal) * chartHeight
          const label = d.date.slice(5)
          const showLabel = data.length <= 15 || i % Math.ceil(data.length / 15) === 0
          return (
            <div key={d.date} className="flex flex-col items-center group relative" style={{ minWidth: barWidth + 2 }}>
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 px-2 py-1 rounded text-[10px] whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="text-gray-300">{d.date}</span><br />
                <span className="text-blue-400">{d.sent} env</span> · <span className="text-emerald-400">{d.delivered} ent</span>
              </div>
              <div className="flex gap-[1px]" style={{ height: chartHeight, alignItems: 'flex-end' }}>
                <div
                  className="rounded-t-sm transition-all"
                  style={{
                    width: barWidth / 2,
                    height: Math.max(sentH, 2),
                    background: 'rgba(37,99,235,0.6)',
                  }}
                />
                <div
                  className="rounded-t-sm transition-all"
                  style={{
                    width: barWidth / 2,
                    height: Math.max(deliveredH, 2),
                    background: 'rgba(16,185,129,0.6)',
                  }}
                />
              </div>
              {showLabel && (
                <span className="text-[8px] text-gray-600 mt-1 leading-none">{label}</span>
              )}
            </div>
          )
        })}
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
