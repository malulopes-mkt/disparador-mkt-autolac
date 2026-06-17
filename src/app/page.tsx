'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
  totals: {
    sent: number
    delivered: number
    read: number
    clicked: number
    deliveryRate: number
    readRate: number
    clickRate: number
    errors: number
  }
  daily: { date: string; sent: number; delivered: number }[]
  templates: {
    name: string
    sent: number
    delivered: number
    read: number
    clicked: number
    deliveryRate: number
    readRate: number
    clickRate: number
  }[]
  available: boolean
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [insights, setInsights] = useState<MetaInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [insightsLoading, setInsightsLoading] = useState(false)

  const now = new Date()
  const thirtyAgo = new Date()
  thirtyAgo.setDate(thirtyAgo.getDate() - 30)
  const [startDate, setStartDate] = useState<Date>(thirtyAgo)
  const [endDate, setEndDate] = useState<Date>(now)
  const [showDatePicker, setShowDatePicker] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const fetchInsights = useCallback((start: Date, end: Date) => {
    setInsightsLoading(true)
    fetch(`/api/meta/insights?start=${toISODate(start)}&end=${toISODate(end)}`)
      .then(r => r.json())
      .then(setInsights)
      .catch(() => setInsights(null))
      .finally(() => setInsightsLoading(false))
  }, [])

  useEffect(() => {
    fetchInsights(startDate, endDate)
  }, [startDate, endDate, fetchInsights])

  function applyPreset(days: number) {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    setStartDate(start)
    setEndDate(end)
    setShowDatePicker(false)
  }

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
        <StatsCard label="Enviadas Hoje" value={data.sentToday} subtitle={`${data.sentWeek} esta semana`} icon={<SendIcon />} />
        <StatsCard label="Enviadas no Mes" value={data.sentMonth} subtitle={`${data.failedMonth} falharam`} icon={<CalendarIcon />} />
        <StatsCard label="Taxa de Entrega" value={`${data.deliveryRate}%`} subtitle="Entregues + Lidas" icon={<CheckIcon />} />
        <StatsCard label="Taxa de Resposta" value={`${data.responseRate}%`} subtitle={`${data.activeTriggers} gatilhos ativos`} icon={<ReplyIcon />} />
      </div>

      {insights?.available && (
        <>
          {/* Header com seletor de datas */}
          <div className="glass-card mb-6">
            <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--glass-border)' }}>
              <div>
                <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                  <MetaIcon />
                  Insights Meta WhatsApp
                </h2>
                <p className="text-[10px] text-gray-500 mt-0.5">Dados oficiais da API Meta Business</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <CalendarSmallIcon />
                  <span className="text-gray-300">{formatDateBR(startDate)} - {formatDateBR(endDate)}</span>
                  <ChevronDownIcon />
                </button>

                {showDatePicker && (
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onApply={(s, e) => { setStartDate(s); setEndDate(e); setShowDatePicker(false) }}
                    onPreset={applyPreset}
                    onClose={() => setShowDatePicker(false)}
                  />
                )}
              </div>
            </div>

            {/* Metricas principais */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0 divide-x" style={{ borderColor: 'var(--glass-border)' }}>
              <MetricCell label="Mensagens Enviadas" value={insights.totals.sent} />
              <MetricCell label="Entregues" value={insights.totals.delivered} />
              <MetricCell label="Taxa de Leitura" value={`${insights.totals.readRate}%`} color={insights.totals.readRate > 0 ? 'emerald' : undefined} />
              <MetricCell label="Taxa de Cliques" value={`${insights.totals.clickRate}%`} color={insights.totals.clickRate > 0 ? 'blue' : undefined} />
              <MetricCell label="Erros de Envio" value={insights.totals.errors} color={insights.totals.errors > 0 ? 'red' : undefined} />
              <MetricCell label="Taxa de Entrega" value={`${insights.totals.deliveryRate}%`} color={insights.totals.deliveryRate >= 90 ? 'emerald' : 'yellow'} />
            </div>

            {/* Grafico */}
            {insights.daily.length > 0 && (
              <div className="px-5 py-5 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-gray-400">Desempenho Diario</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(37,99,235,0.7)' }} />
                      <span className="text-[10px] text-gray-500">Enviadas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(16,185,129,0.7)' }} />
                      <span className="text-[10px] text-gray-500">Entregues</span>
                    </div>
                  </div>
                </div>
                <MiniChart data={insights.daily} />
              </div>
            )}

            {insightsLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Tabela de templates */}
          {insights.templates.length > 0 && (
            <div className="glass-card mb-8">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
                <h2 className="font-semibold text-white text-sm">Performance por Template</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">Metricas de cada template no periodo selecionado</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left font-medium">Template</th>
                      <th className="px-3 py-3 text-right font-medium">Enviadas</th>
                      <th className="px-3 py-3 text-right font-medium">Entregues</th>
                      <th className="px-3 py-3 text-right font-medium">Lidas</th>
                      <th className="px-3 py-3 text-right font-medium">Cliques</th>
                      <th className="px-3 py-3 text-right font-medium">Leitura %</th>
                      <th className="px-3 py-3 text-right font-medium">Clique %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.templates.map(t => (
                      <tr key={t.name} className="border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'var(--glass-border)' }}>
                        <td className="px-5 py-3 text-gray-200 font-medium">{t.name}</td>
                        <td className="px-3 py-3 text-right text-gray-400">{t.sent.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-3 text-right text-gray-400">{t.delivered.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-3 text-right text-gray-400">{t.read.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-3 text-right text-gray-400">{t.clicked.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-3 text-right">
                          <RateIndicator value={t.readRate} thresholds={[50, 30]} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <RateIndicator value={t.clickRate} thresholds={[10, 5]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Erros de envio */}
          {insights.totals.errors > 0 && (
            <div className="glass-card mb-8" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
              <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--glass-border)' }}>
                <ErrorIcon />
                <div>
                  <h2 className="font-semibold text-red-400 text-sm">Mensagens com Erro</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">{insights.totals.errors.toLocaleString('pt-BR')} mensagens nao foram entregues no periodo</p>
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, insights.totals.sent > 0 ? (insights.totals.errors / insights.totals.sent) * 100 : 0)}%`,
                        background: 'rgba(239,68,68,0.6)',
                      }}
                    />
                  </div>
                  <span className="text-xs text-red-400 font-medium">
                    {insights.totals.sent > 0 ? Math.round((insights.totals.errors / insights.totals.sent) * 100) : 0}% de falha
                  </span>
                </div>
                <p className="text-[10px] text-gray-600 mt-2">Verifique se os numeros de destino estao corretos e se o template foi aprovado pela Meta.</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ultimas mensagens */}
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

/* ==================== Components ==================== */

function MetricCell({ label, value, color }: { label: string; value: string | number; color?: 'emerald' | 'red' | 'yellow' | 'blue' }) {
  const colorMap = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
  }
  const formatted = typeof value === 'number' ? value.toLocaleString('pt-BR') : value

  return (
    <div className="px-4 py-4 text-center" style={{ borderColor: 'var(--glass-border)' }}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider leading-tight">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color ? colorMap[color] : 'text-gradient'}`}>
        {formatted}
      </p>
    </div>
  )
}

function RateIndicator({ value, thresholds }: { value: number; thresholds: [number, number] }) {
  const color = value >= thresholds[0] ? 'text-emerald-400' : value >= thresholds[1] ? 'text-yellow-400' : 'text-red-400'
  return <span className={color}>{value}%</span>
}

function DateRangePicker({
  startDate,
  endDate,
  onApply,
  onPreset,
  onClose,
}: {
  startDate: Date
  endDate: Date
  onApply: (start: Date, end: Date) => void
  onPreset: (days: number) => void
  onClose: () => void
}) {
  const [tempStart, setTempStart] = useState(toISODate(startDate))
  const [tempEnd, setTempEnd] = useState(toISODate(endDate))
  const [viewMonth, setViewMonth] = useState(new Date(endDate.getFullYear(), endDate.getMonth(), 1))
  const [selecting, setSelecting] = useState<'start' | 'end'>('start')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const prevMonth = new Date(viewMonth)
  prevMonth.setMonth(prevMonth.getMonth() - 1)

  function getDaysInMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  function getFirstDayOfWeek(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  function handleDayClick(year: number, month: number, day: number) {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (selecting === 'start') {
      setTempStart(d)
      if (d > tempEnd) setTempEnd(d)
      setSelecting('end')
    } else {
      if (d < tempStart) {
        setTempStart(d)
      } else {
        setTempEnd(d)
      }
      setSelecting('start')
    }
  }

  function isInRange(year: number, month: number, day: number) {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return d >= tempStart && d <= tempEnd
  }

  function isStart(year: number, month: number, day: number) {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return d === tempStart
  }

  function isEnd(year: number, month: number, day: number) {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return d === tempEnd
  }

  function isToday(year: number, month: number, day: number) {
    const t = new Date()
    return year === t.getFullYear() && month === t.getMonth() && day === t.getDate()
  }

  function isFuture(year: number, month: number, day: number) {
    const d = new Date(year, month, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d > today
  }

  function renderMonth(monthDate: Date) {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const daysInMonth = getDaysInMonth(monthDate)
    const firstDay = getFirstDayOfWeek(monthDate)
    const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)

    return (
      <div>
        <p className="text-xs font-medium text-gray-300 text-center mb-2 capitalize">{monthName}</p>
        <div className="grid grid-cols-7 gap-0 text-center">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
            <div key={d} className="text-[9px] text-gray-600 py-1 font-medium">{d}</div>
          ))}
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const future = isFuture(year, month, day)
            const inRange = isInRange(year, month, day)
            const start = isStart(year, month, day)
            const end = isEnd(year, month, day)
            const today = isToday(year, month, day)

            return (
              <button
                key={day}
                disabled={future}
                onClick={() => handleDayClick(year, month, day)}
                className="relative py-1 text-[11px] transition-colors"
                style={{
                  background: start || end
                    ? 'rgba(37,99,235,0.6)'
                    : inRange
                    ? 'rgba(37,99,235,0.15)'
                    : 'transparent',
                  color: future ? '#4b5563' : start || end ? '#fff' : inRange ? '#93c5fd' : today ? '#60a5fa' : '#d1d5db',
                  borderRadius: start ? '4px 0 0 4px' : end ? '0 4px 4px 0' : '0',
                  cursor: future ? 'default' : 'pointer',
                  fontWeight: today || start || end ? 600 : 400,
                }}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-2xl p-4"
      style={{ background: 'rgb(15, 23, 42)', border: '1px solid rgba(255,255,255,0.1)', minWidth: 520 }}
    >
      {/* Presets */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { label: 'Ultimos 7 dias', days: 7 },
          { label: 'Ultimos 15 dias', days: 15 },
          { label: 'Ultimos 30 dias', days: 30 },
          { label: 'Ultimos 60 dias', days: 60 },
          { label: 'Ultimos 90 dias', days: 90 },
        ].map(p => (
          <button
            key={p.days}
            onClick={() => onPreset(p.days)}
            className="px-3 py-1 rounded text-[10px] transition-colors hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Calendarios */}
      <div className="flex gap-2 items-start mb-4">
        <button
          onClick={() => {
            const prev = new Date(viewMonth)
            prev.setMonth(prev.getMonth() - 1)
            setViewMonth(prev)
          }}
          className="p-1 rounded hover:bg-white/10 text-gray-400 mt-1"
        >
          <ChevronLeftIcon />
        </button>
        <div className="flex gap-4 flex-1">
          {renderMonth(prevMonth)}
          {renderMonth(viewMonth)}
        </div>
        <button
          onClick={() => {
            const next = new Date(viewMonth)
            next.setMonth(next.getMonth() + 1)
            setViewMonth(next)
          }}
          className="p-1 rounded hover:bg-white/10 text-gray-400 mt-1"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Range selecionado + botoes */}
      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <p className="text-xs text-gray-400">
          {new Date(tempStart).toLocaleDateString('pt-BR')} – {new Date(tempEnd).toLocaleDateString('pt-BR')}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs text-gray-400 transition-colors hover:bg-white/5" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            Cancelar
          </button>
          <button
            onClick={() => onApply(new Date(tempStart), new Date(tempEnd))}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'rgba(37,99,235,0.8)' }}
          >
            Atualizar
          </button>
        </div>
      </div>
    </div>
  )
}

function MiniChart({ data }: { data: { date: string; sent: number; delivered: number }[] }) {
  if (data.length === 0) return null

  const maxVal = Math.max(...data.map(d => d.sent), 1)
  const chartHeight = 140
  const barWidth = Math.max(4, Math.min(24, Math.floor(700 / data.length) - 2))

  return (
    <div className="flex items-end gap-[2px] overflow-x-auto pb-1" style={{ height: chartHeight + 28 }}>
      {data.map((d, i) => {
        const sentH = (d.sent / maxVal) * chartHeight
        const deliveredH = (d.delivered / maxVal) * chartHeight
        const showLabel = data.length <= 15 || i % Math.ceil(data.length / 15) === 0

        return (
          <div key={d.date} className="flex flex-col items-center group relative" style={{ minWidth: barWidth + 2 }}>
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 px-2 py-1 rounded text-[10px] whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="text-gray-300">{new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span><br />
              <span className="text-blue-400">{d.sent} env</span> · <span className="text-emerald-400">{d.delivered} ent</span>
            </div>
            <div className="flex gap-[1px]" style={{ height: chartHeight, alignItems: 'flex-end' }}>
              <div className="rounded-t-sm transition-all" style={{ width: barWidth / 2, height: Math.max(sentH, 2), background: 'rgba(37,99,235,0.6)' }} />
              <div className="rounded-t-sm transition-all" style={{ width: barWidth / 2, height: Math.max(deliveredH, 2), background: 'rgba(16,185,129,0.6)' }} />
            </div>
            {showLabel && (
              <span className="text-[8px] text-gray-600 mt-1 leading-none">
                {new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>
        )
      })}
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

/* ==================== Icons ==================== */

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

function CalendarSmallIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function MetaIcon() {
  return (
    <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
