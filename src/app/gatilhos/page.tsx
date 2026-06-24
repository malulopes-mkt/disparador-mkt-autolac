'use client'

import { useEffect, useState, useCallback } from 'react'

interface Trigger {
  id: string
  name: string
  description: string
  hubspotEventType: string
  hubspotProperty: string | null
  hubspotValue: string | null
  templateName: string
  variableMapping: string
  active: boolean
  segmentId: string | null
  segmentName: string | null
  scheduledAt: string | null
  status: string
  totalContacts: number
  sentCount: number
  failedCount: number
  createdAt: string
  _count?: { messages: number }
}

interface Template {
  id: string
  name: string
  status: string
}

interface HubSpotList {
  listId: string
  name: string
  listType: string
  size: number
}

const EVENT_TYPES = [
  { value: 'dealstage_change', label: 'Mudanca de Etapa do Deal' },
  { value: 'form_submission', label: 'Formulario Enviado' },
  { value: 'contact_created', label: 'Contato Criado' },
  { value: 'property_change', label: 'Propriedade Alterada' },
  { value: 'custom', label: 'Evento Customizado' },
  { value: 'campaign', label: 'Campanha (Segmento)' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'text-emerald-400' },
  draft: { label: 'Rascunho', color: 'text-gray-400' },
  scheduled: { label: 'Agendado', color: 'text-amber-400' },
  running: { label: 'Enviando...', color: 'text-blue-400' },
  completed: { label: 'Concluido', color: 'text-cyan-400' },
  failed: { label: 'Falhou', color: 'text-red-400' },
}

export default function GatilhosPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trigger | null>(null)
  const [hubspotLists, setHubspotLists] = useState<HubSpotList[]>([])
  const [syncingLists, setSyncingLists] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; count: number; error?: string } | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/triggers').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
    ]).then(([t, tmpl]) => {
      setTriggers(t)
      setTemplates(tmpl)
      setLoading(false)
    })
  }, [])

  const syncHubspotLists = useCallback(async () => {
    setSyncingLists(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/hubspot/lists')
      const data = await res.json()
      if (Array.isArray(data)) {
        setHubspotLists(data)
        setSyncResult({ ok: true, count: data.length })
      } else {
        setSyncResult({ ok: false, count: 0, error: data.error || 'Erro ao carregar listas' })
      }
    } catch {
      setSyncResult({ ok: false, count: 0, error: 'Erro de conexao com o servidor' })
    } finally {
      setSyncingLists(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const hasRunning = triggers.some(t => t.status === 'running')
    if (!hasRunning) return
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [triggers, load])

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/triggers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    load()
  }

  async function deleteTrigger(id: string) {
    if (!confirm('Tem certeza que deseja excluir este gatilho?')) return
    await fetch(`/api/triggers/${id}`, { method: 'DELETE' })
    load()
  }

  async function resumeCampaign(id: string) {
    if (!confirm('Retomar envio da campanha? Contatos já enviados serão pulados.')) return
    fetch(`/api/campaigns/${id}/execute`, { method: 'POST' })
    setTimeout(load, 1000)
  }

  async function saveTrigger(data: Record<string, unknown>) {
    const url = editing ? `/api/triggers/${editing.id}` : '/api/triggers'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setShowForm(false)
    setEditing(null)
    load()
  }

  if (loading) return <PageLoader />

  const campaigns = triggers.filter(t => t.segmentId)
  const eventTriggers = triggers.filter(t => !t.segmentId)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="text-gradient">Gatilhos & Campanhas</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">Configure disparos por evento ou campanha com segmentos do HubSpot</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={syncHubspotLists}
            disabled={syncingLists}
            className="btn-ghost-wmi px-4 py-2.5 text-sm flex items-center gap-2"
          >
            {syncingLists ? (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            )}
            Sincronizar com o HubSpot
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="btn-primary-wmi px-5 py-2.5 text-sm"
          >
            + Novo Gatilho
          </button>
        </div>
      </div>

      {syncResult && (
        <div className={`mb-6 rounded-lg p-4 text-sm flex items-center justify-between ${syncResult.ok ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          {syncResult.ok ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              {syncResult.count} segmentos sincronizados do HubSpot
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {syncResult.error}
            </div>
          )}
          <button onClick={() => setSyncResult(null)} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>
      )}

      {hubspotLists.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            Segmentos HubSpot ({hubspotLists.length})
          </h2>
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Nome</th>
                  <th className="text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Tipo</th>
                  <th className="text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Contatos</th>
                  <th className="text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">ID</th>
                </tr>
              </thead>
              <tbody>
                {hubspotLists.map((l, i) => (
                  <tr key={l.listId} className="hover:bg-white/[0.02] transition-colors" style={i < hubspotLists.length - 1 ? { borderBottom: '1px solid var(--glass-border)' } : {}}>
                    <td className="px-5 py-2.5 text-sm text-gray-200">{l.name}</td>
                    <td className="px-5 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${l.listType === 'DYNAMIC' ? 'text-blue-400' : 'text-gray-400'}`}>
                        {l.listType === 'DYNAMIC' ? 'Dinamica' : 'Estatica'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-center text-sm text-gray-400">{l.size.toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-gray-600 font-mono">{l.listId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            Campanhas (Segmentos)
          </h2>
          <div className="grid gap-4">
            {campaigns.map(t => (
              <CampaignCard
                key={t.id}
                trigger={t}
                onEdit={() => { setEditing(t); setShowForm(true) }}
                onDelete={() => deleteTrigger(t.id)}
                onToggle={() => toggleActive(t.id, t.active)}
                onResume={() => resumeCampaign(t.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        {campaigns.length > 0 && (
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Gatilhos por Evento
          </h2>
        )}

        {eventTriggers.length === 0 && campaigns.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(37,99,235,0.1)' }}>
              <svg className="w-8 h-8 text-blue-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </div>
            <p className="text-gray-400 text-sm">Nenhum gatilho configurado</p>
            <p className="text-gray-600 text-xs mt-1">Crie seu primeiro gatilho para comecar a enviar mensagens</p>
          </div>
        ) : eventTriggers.length > 0 && (
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Nome</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Evento</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Template</th>
                  <th className="text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Enviadas</th>
                  <th className="text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Ativo</th>
                  <th className="text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {eventTriggers.map((t, i) => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition-colors" style={i < eventTriggers.length - 1 ? { borderBottom: '1px solid var(--glass-border)' } : {}}>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-200">{t.name}</p>
                      {t.description && <p className="text-xs text-gray-600 mt-0.5">{t.description}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-400">{EVENT_TYPES.find(e => e.value === t.hubspotEventType)?.label || t.hubspotEventType}</p>
                      {t.hubspotProperty && (
                        <p className="text-xs text-gray-600 mt-0.5">{t.hubspotProperty} = {t.hubspotValue}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-400">{t.templateName}</td>
                    <td className="px-5 py-3 text-center text-sm text-gray-400">{t._count?.messages || 0}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggleActive(t.id, t.active)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${t.active ? 'bg-blue-600' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${t.active ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => { setEditing(t); setShowForm(true) }}
                        className="text-xs text-blue-400 hover:text-blue-300 mr-3 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteTrigger(t.id)}
                        className="btn-danger-wmi text-xs"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <TriggerFormModal
          trigger={editing}
          templates={templates}
          hubspotLists={hubspotLists}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSave={saveTrigger}
        />
      )}
    </div>
  )
}

function CampaignCard({
  trigger,
  onEdit,
  onDelete,
  onToggle,
  onResume,
}: {
  trigger: Trigger
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onResume: () => void
}) {
  const statusInfo = STATUS_LABELS[trigger.status] || STATUS_LABELS.active
  const progress = trigger.totalContacts > 0
    ? Math.round(((trigger.sentCount + trigger.failedCount) / trigger.totalContacts) * 100)
    : 0
  const tz = 'America/Sao_Paulo'

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">{trigger.name}</h3>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          {trigger.description && (
            <p className="text-xs text-gray-500 mt-1">{trigger.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${trigger.active ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${trigger.active ? 'left-5' : 'left-0.5'}`} />
          </button>
          {trigger.status === 'running' && trigger.sentCount < trigger.totalContacts && (
            <button onClick={onResume} className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold px-2 py-1 rounded" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>Retomar</button>
          )}
          <button onClick={onEdit} className="text-xs text-blue-400 hover:text-blue-300 font-medium">Editar</button>
          <button onClick={onDelete} className="btn-danger-wmi text-xs">Excluir</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <span className="text-gray-600 uppercase tracking-wider">Segmento</span>
          <p className="text-gray-300 mt-0.5 flex items-center gap-1">
            <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            {trigger.segmentName || 'N/A'}
          </p>
        </div>
        <div>
          <span className="text-gray-600 uppercase tracking-wider">Template</span>
          <p className="text-gray-300 mt-0.5">{trigger.templateName}</p>
        </div>
        <div>
          <span className="text-gray-600 uppercase tracking-wider">Agendamento</span>
          <p className="text-gray-300 mt-0.5">
            {trigger.scheduledAt
              ? new Date(trigger.scheduledAt).toLocaleString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'Sem agendamento'}
          </p>
        </div>
      </div>

      {(trigger.status === 'running' || trigger.status === 'completed') && trigger.totalContacts > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>{trigger.sentCount} enviadas / {trigger.failedCount} falhas</span>
            <span>{trigger.totalContacts} contatos | {progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full flex">
              {trigger.sentCount > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(trigger.sentCount / trigger.totalContacts) * 100}%` }}
                />
              )}
              {trigger.failedCount > 0 && (
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${(trigger.failedCount / trigger.totalContacts) * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TriggerFormModal({
  trigger,
  templates,
  hubspotLists: parentLists,
  onClose,
  onSave,
}: {
  trigger: Trigger | null
  templates: Template[]
  hubspotLists: HubSpotList[]
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(trigger?.name || '')
  const [description, setDescription] = useState(trigger?.description || '')
  const [eventType, setEventType] = useState(trigger?.hubspotEventType || 'dealstage_change')
  const [property, setProperty] = useState(trigger?.hubspotProperty || '')
  const [value, setValue] = useState(trigger?.hubspotValue || '')
  const [templateName, setTemplateName] = useState(trigger?.templateName || '')
  const [segmentId, setSegmentId] = useState(trigger?.segmentId || '')
  const [segmentName, setSegmentName] = useState(trigger?.segmentName || '')
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!trigger?.scheduledAt) return ''
    const d = new Date(trigger.scheduledAt)
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  })
  const [saving, setSaving] = useState(false)

  const [lists, setLists] = useState<HubSpotList[]>(parentLists)
  const [loadingLists, setLoadingLists] = useState(false)
  const [listsError, setListsError] = useState<string | null>(null)

  const approvedTemplates = templates.filter(t => t.status === 'APPROVED')
  const isCampaign = eventType === 'campaign'
  const needsProperty = ['dealstage_change', 'property_change'].includes(eventType)

  useEffect(() => {
    if (isCampaign && lists.length === 0 && !loadingLists) {
      setLoadingLists(true)
      setListsError(null)
      fetch('/api/hubspot/lists')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setLists(data)
          } else {
            setListsError(data.error || 'Erro ao carregar listas')
          }
        })
        .catch(() => setListsError('Erro de conexao'))
        .finally(() => setLoadingLists(false))
    }
  }, [isCampaign, lists.length, loadingLists])

  function handleSegmentChange(listId: string) {
    setSegmentId(listId)
    const list = lists.find(l => l.listId === listId)
    setSegmentName(list?.name || '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({
      name,
      description,
      hubspotEventType: eventType,
      hubspotProperty: needsProperty ? property : null,
      hubspotValue: needsProperty ? value : null,
      templateName,
      segmentId: isCampaign ? segmentId : null,
      segmentName: isCampaign ? segmentName : null,
      scheduledAt: isCampaign && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ border: '1px solid rgba(37,99,235,0.3)' }}>
        <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', backdropFilter: 'blur(20px)' }}>
          <h2 className="text-lg font-semibold text-white">{trigger ? 'Editar Gatilho' : 'Novo Gatilho'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="glass-input"
              placeholder="Ex: Boas-vindas ao fechar deal"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Descricao (opcional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="glass-textarea"
              rows={2}
              placeholder="Descreva quando este gatilho deve disparar"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Tipo</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="glass-select"
            >
              {EVENT_TYPES.map(et => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>

          {needsProperty && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Propriedade</label>
                <input
                  type="text"
                  value={property}
                  onChange={e => setProperty(e.target.value)}
                  className="glass-input"
                  placeholder="Ex: dealstage"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Valor</label>
                <input
                  type="text"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  className="glass-input"
                  placeholder="Ex: closedwon"
                />
              </div>
            </div>
          )}

          {isCampaign && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                  Segmento HubSpot
                </label>
                {loadingLists ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Carregando listas do HubSpot...
                  </div>
                ) : listsError ? (
                  <div>
                    <div className="text-xs text-amber-400 py-2 mb-2">
                      Nao foi possivel carregar listas automaticamente. Adicione o scope <code className="text-cyan-400">crm.lists.read</code> ao token HubSpot.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          value={segmentId}
                          onChange={e => setSegmentId(e.target.value)}
                          className="glass-input"
                          placeholder="ID da lista (ex: 123)"
                          required
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={segmentName}
                          onChange={e => setSegmentName(e.target.value)}
                          className="glass-input"
                          placeholder="Nome da lista"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ) : lists.length > 0 ? (
                  <select
                    value={segmentId}
                    onChange={e => handleSegmentChange(e.target.value)}
                    className="glass-select"
                    required
                  >
                    <option value="">Selecione um segmento</option>
                    {lists.map(l => (
                      <option key={l.listId} value={l.listId}>
                        {l.name} ({l.size} contatos) — {l.listType === 'DYNAMIC' ? 'Dinamica' : 'Estatica'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <div className="text-xs text-gray-500 py-2 mb-2">Nenhuma lista encontrada. Insira manualmente:</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          value={segmentId}
                          onChange={e => setSegmentId(e.target.value)}
                          className="glass-input"
                          placeholder="ID da lista (ex: 123)"
                          required
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={segmentName}
                          onChange={e => setSegmentName(e.target.value)}
                          className="glass-input"
                          placeholder="Nome da lista"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                  Agendar Disparo (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="glass-input"
                  min={(() => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })()}
                />
                <p className="text-xs text-gray-600 mt-1">
                  {scheduledAt
                    ? `Disparo agendado para ${new Date(scheduledAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                    : 'Sem agendamento — o disparo sera acionado manualmente via N8N'}
                </p>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Template WhatsApp</label>
            {approvedTemplates.length > 0 ? (
              <select
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="glass-select"
                required
              >
                <option value="">Selecione um template</option>
                {approvedTemplates.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="glass-input"
                  placeholder="Nome exato do template na Meta"
                  required
                />
                <p className="text-xs text-gray-600 mt-1">Sincronize os templates na aba Templates para ver a lista</p>
              </div>
            )}
          </div>

          {isCampaign && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
              <p className="text-blue-300 font-medium mb-1">Integracao N8N</p>
              <p className="text-gray-400">
                Configure o N8N para chamar periodicamente <code className="text-cyan-400 text-[11px]">GET /api/campaigns/pending</code> com
                o header <code className="text-cyan-400 text-[11px]">x-webhook-token</code>. Quando houver campanhas pendentes,
                chame <code className="text-cyan-400 text-[11px]">POST /api/campaigns/ID/execute</code> para cada uma.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost-wmi px-4 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name || !templateName || (isCampaign && !segmentId)}
              className="btn-primary-wmi px-5 py-2 text-sm"
            >
              {saving ? 'Salvando...' : trigger ? 'Salvar' : 'Criar Gatilho'}
            </button>
          </div>
        </form>
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
