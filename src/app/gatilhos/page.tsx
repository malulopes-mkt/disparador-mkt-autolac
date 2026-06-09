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
  createdAt: string
  _count?: { messages: number }
}

interface Template {
  id: string
  name: string
  status: string
}

const EVENT_TYPES = [
  { value: 'dealstage_change', label: 'Mudanca de Etapa do Deal' },
  { value: 'form_submission', label: 'Formulario Enviado' },
  { value: 'contact_created', label: 'Contato Criado' },
  { value: 'property_change', label: 'Propriedade Alterada' },
  { value: 'custom', label: 'Evento Customizado' },
]

export default function GatilhosPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trigger | null>(null)

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

  useEffect(() => { load() }, [load])

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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="text-gradient">Gatilhos</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">Configure quando enviar mensagens WhatsApp</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="btn-primary-wmi px-5 py-2.5 text-sm"
        >
          + Novo Gatilho
        </button>
      </div>

      {triggers.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(37,99,235,0.1)' }}>
            <svg className="w-8 h-8 text-blue-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <p className="text-gray-400 text-sm">Nenhum gatilho configurado</p>
          <p className="text-gray-600 text-xs mt-1">Crie seu primeiro gatilho para comecar a enviar mensagens</p>
        </div>
      ) : (
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
              {triggers.map((t, i) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors" style={i < triggers.length - 1 ? { borderBottom: '1px solid var(--glass-border)' } : {}}>
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

      {showForm && (
        <TriggerFormModal
          trigger={editing}
          templates={templates}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSave={saveTrigger}
        />
      )}
    </div>
  )
}

function TriggerFormModal({
  trigger,
  templates,
  onClose,
  onSave,
}: {
  trigger: Trigger | null
  templates: Template[]
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(trigger?.name || '')
  const [description, setDescription] = useState(trigger?.description || '')
  const [eventType, setEventType] = useState(trigger?.hubspotEventType || 'dealstage_change')
  const [property, setProperty] = useState(trigger?.hubspotProperty || '')
  const [value, setValue] = useState(trigger?.hubspotValue || '')
  const [templateName, setTemplateName] = useState(trigger?.templateName || '')
  const [saving, setSaving] = useState(false)

  const approvedTemplates = templates.filter(t => t.status === 'APPROVED')
  const needsProperty = ['dealstage_change', 'property_change'].includes(eventType)

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
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-lg" style={{ border: '1px solid rgba(37,99,235,0.3)' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
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
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Evento do HubSpot</label>
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
              disabled={saving || !name || !templateName}
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
