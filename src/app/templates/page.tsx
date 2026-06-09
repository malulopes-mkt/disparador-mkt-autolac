'use client'

import { useEffect, useState } from 'react'
import StatusBadge from '@/components/StatusBadge'

interface Template {
  id: string
  name: string
  language: string
  status: string
  category: string
  bodyText: string
  variables: string
  lastSyncedAt: string
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(setTemplates).finally(() => setLoading(false))
  }, [])

  async function syncTemplates() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/templates/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(`${data.synced} templates sincronizados`)
        const updated = await fetch('/api/templates').then(r => r.json())
        setTemplates(updated)
      } else {
        setSyncResult(`Erro: ${data.error}`)
      }
    } catch {
      setSyncResult('Erro de conexao')
    }
    setSyncing(false)
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="text-gradient">Templates</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">Templates de mensagem aprovados pela Meta</p>
        </div>
        <div className="flex items-center gap-3">
          {syncResult && (
            <span className="text-xs text-gray-400">{syncResult}</span>
          )}
          <button
            onClick={syncTemplates}
            disabled={syncing}
            className="btn-primary-wmi px-4 py-2.5 text-sm flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {syncing ? 'Sincronizando...' : 'Sincronizar da Meta'}
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(37,99,235,0.1)' }}>
            <svg className="w-8 h-8 text-blue-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <p className="text-gray-400 text-sm">Nenhum template encontrado</p>
          <p className="text-gray-600 text-xs mt-1">Clique em &quot;Sincronizar da Meta&quot; para importar seus templates</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Nome</th>
                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Idioma</th>
                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Categoria</th>
                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Corpo</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr
                  key={t.id}
                  className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  style={i < templates.length - 1 ? { borderBottom: '1px solid var(--glass-border)' } : {}}
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-200">{t.name}</p>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400">{t.language}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{t.category}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-5 py-3">
                    {expanded === t.id ? (
                      <div>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{t.bodyText}</p>
                        {t.variables && t.variables !== '[]' && (
                          <p className="text-xs text-cyan-400 mt-2">
                            Variaveis: {JSON.parse(t.variables).join(', ')}
                          </p>
                        )}
                        <p className="text-xs text-gray-600 mt-1">
                          Sincronizado: {new Date(t.lastSyncedAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 truncate max-w-xs">{t.bodyText || '—'}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
