'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatPhoneDisplay, timeAgo } from '@/lib/utils'

interface Conversation {
  phone: string
  name: string | null
  lastMessage: string
  lastTimestamp: string
  direction: string
  totalMessages: number
  inboundCount: number
  outboundCount: number
}

export default function ConversasPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    fetch(`/api/conversations${params}`)
      .then(r => r.json())
      .then(setConversations)
      .finally(() => setLoading(false))
  }, [search])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="text-gradient">Conversas</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2">Historico de mensagens por contato</p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setLoading(true) }}
          className="glass-input max-w-md"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : conversations.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(37,99,235,0.1)' }}>
            <svg className="w-8 h-8 text-blue-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          </div>
          <p className="text-gray-400 text-sm">Nenhuma conversa encontrada</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {conversations.map((conv, i) => (
            <Link
              key={conv.phone}
              href={`/conversas/${encodeURIComponent(conv.phone)}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
              style={i < conversations.length - 1 ? { borderBottom: '1px solid var(--glass-border)' } : {}}
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-blue-300 shrink-0" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}>
                {(conv.name || conv.phone.slice(-4))[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {conv.name || formatPhoneDisplay(conv.phone)}
                  </p>
                  <span className="text-xs text-gray-600 shrink-0 ml-2">
                    {timeAgo(new Date(conv.lastTimestamp))}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-gray-500 truncate">
                    {conv.direction === 'outbound' ? 'Voce: ' : ''}
                    {conv.lastMessage}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-gray-600">{conv.totalMessages} msgs</span>
                    {conv.inboundCount > 0 && (
                      <span className="w-5 h-5 text-[10px] font-semibold rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)' }}>
                        {conv.inboundCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
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
