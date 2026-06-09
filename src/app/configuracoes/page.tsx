'use client'

import { useEffect, useState } from 'react'

interface SettingsMap {
  [key: string]: string
}

const SECTIONS = [
  {
    title: 'WhatsApp Business API (Meta)',
    description: 'Credenciais da API oficial da Meta para enviar e receber mensagens.',
    fields: [
      { key: 'META_PHONE_NUMBER_ID', label: 'Phone Number ID', placeholder: 'Ex: 123456789012345', type: 'text', help: 'ID do numero de telefone na Meta Business Suite' },
      { key: 'META_WABA_ID', label: 'Business Account ID (WABA)', placeholder: 'Ex: 123456789012345', type: 'text', help: 'ID da conta WhatsApp Business' },
      { key: 'META_ACCESS_TOKEN', label: 'Access Token', placeholder: 'EAAxxxxxxxx...', type: 'password', help: 'Token de acesso permanente da API' },
      { key: 'META_WEBHOOK_VERIFY_TOKEN', label: 'Webhook Verify Token', placeholder: 'Ex: wmi-whatsapp-2026', type: 'text', help: 'Token que voce inventa para verificar o webhook da Meta' },
    ],
  },
  {
    title: 'HubSpot CRM',
    description: 'Token de acesso para buscar contatos e registrar interacoes.',
    fields: [
      { key: 'HUBSPOT_ACCESS_TOKEN', label: 'Access Token', placeholder: 'pat-xx-xxxxxxxx...', type: 'password', help: 'Token privado do HubSpot (Settings > Integrations > Private Apps)' },
    ],
  },
  {
    title: 'Classificacao com IA (opcional)',
    description: 'Chave da API Claude para classificar conversas automaticamente.',
    fields: [
      { key: 'CLAUDE_API_KEY', label: 'Claude API Key', placeholder: 'sk-ant-xxxxxxxx...', type: 'password', help: 'Opcional. Sem isso, a classificacao fica desativada' },
    ],
  },
  {
    title: 'Numeros Internos (Blocklist)',
    description: 'Numeros da equipe que devem ser ignorados nos disparos.',
    fields: [
      { key: 'INTERNAL_PHONES', label: 'Numeros internos', placeholder: '5511999999999,5537999999999', type: 'text', help: 'Separados por virgula, sem + e sem espacos' },
    ],
  },
  {
    title: 'Senha do Painel',
    description: 'Altere a senha de acesso ao painel.',
    fields: [
      { key: 'APP_PASSWORD', label: 'Nova senha', placeholder: 'Digite a nova senha', type: 'password', help: 'Sera aplicada no proximo login' },
    ],
  },
]

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<SettingsMap>({})
  const [form, setForm] = useState<SettingsMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        setForm(data)
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `${data.updated} configuracao(oes) salva(s) com sucesso` })
        // Reload settings to get masked values
        const updated = await fetch('/api/settings').then(r => r.json())
        setSettings(updated)
        setForm(updated)
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao salvar' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexao' })
    }
    setSaving(false)
  }

  function togglePassword(key: string) {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function hasChanges(): boolean {
    return SECTIONS.some(section =>
      section.fields.some(f => form[f.key] !== settings[f.key])
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient">Configuracoes</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2">Conecte suas contas e configure o sistema</p>
      </div>

      {message && (
        <div
          className="mb-6 px-4 py-3 rounded-lg text-sm"
          style={{
            background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: message.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {SECTIONS.map(section => (
          <div key={section.title} className="glass-card p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-gray-200">{section.title}</h2>
              <p className="text-xs text-gray-500 mt-1">{section.description}</p>
            </div>

            <div className="space-y-4">
              {section.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                      value={form[field.key] || ''}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="glass-input w-full pr-10"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => togglePassword(field.key)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showPasswords[field.key] ? (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  {field.help && (
                    <p className="text-[10px] text-gray-600 mt-1">{field.help}</p>
                  )}
                  {settings[field.key + '_SOURCE'] === 'env' && form[field.key] === settings[field.key] && (
                    <p className="text-[10px] text-cyan-500/60 mt-1">Configurado via variavel de ambiente</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Valores sensiveis sao salvos no banco de dados e nunca expostos no codigo.
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges()}
          className="btn-primary-wmi px-6 py-2.5 text-sm"
        >
          {saving ? 'Salvando...' : 'Salvar Configuracoes'}
        </button>
      </div>

      <div className="glass-card p-5 mt-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">URLs dos Webhooks</h3>
        <p className="text-xs text-gray-500 mb-3">Configure esses enderecos na Meta e no HubSpot:</p>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Meta WhatsApp Webhook</p>
            <code className="text-xs text-cyan-400 block px-3 py-2 rounded" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}>
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/whatsapp
            </code>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">HubSpot Workflow Webhook</p>
            <code className="text-xs text-cyan-400 block px-3 py-2 rounded" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}>
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/hubspot
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
