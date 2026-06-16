'use client'

import { useEffect, useState, useRef, use, useCallback } from 'react'
import Link from 'next/link'
import ChatBubble from '@/components/ChatBubble'
import { formatPhoneDisplay } from '@/lib/utils'

interface Message {
  id: string
  contactPhone: string
  contactName: string | null
  direction: string
  templateName: string | null
  body: string
  status: string
  timestamp: string
  classifyTipo: string | null
  classifyTom: string | null
  classifyPontos: string | null
  classifyProximo: string | null
}

export default function ChatPage({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = use(params)
  const decodedPhone = decodeURIComponent(phone)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const fetchMessages = useCallback(() => {
    fetch(`/api/messages?phone=${encodeURIComponent(decodedPhone)}&limit=100`)
      .then(r => r.json())
      .then(data => {
        const sorted = [...(data.messages || [])].sort(
          (a: Message, b: Message) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        setMessages(sorted)
        setLoading(false)
      })
  }, [decodedPhone])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 10000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = replyText.trim()
    if (!text || sending) return

    setSending(true)
    setSendError(null)

    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      contactPhone: decodedPhone,
      contactName: null,
      direction: 'outbound',
      templateName: null,
      body: text,
      status: 'sending',
      timestamp: new Date().toISOString(),
      classifyTipo: null,
      classifyTom: null,
      classifyPontos: null,
      classifyProximo: null,
    }
    setMessages(prev => [...prev, optimisticMsg])
    setReplyText('')

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: decodedPhone, message: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
      fetchMessages()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      setReplyText(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const contactName = messages.find(m => m.contactName)?.contactName

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="glass-card rounded-b-none px-5 py-3 flex items-center gap-4">
        <Link href="/conversas" className="text-gray-500 hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-blue-300" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}>
          {(contactName || decodedPhone.slice(-4))[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            {contactName || formatPhoneDisplay(decodedPhone)}
          </p>
          <p className="text-xs text-gray-500">{formatPhoneDisplay(decodedPhone)}</p>
        </div>
      </div>

      <div className="flex-1 chat-bg overflow-auto px-4 py-4" style={{ borderLeft: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-600 px-4 py-2 rounded-lg" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>Nenhuma mensagem</p>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <ChatBubble
                key={msg.id}
                body={msg.body}
                direction={msg.direction}
                status={msg.status}
                timestamp={msg.timestamp}
                templateName={msg.templateName}
                classifyTipo={msg.classifyTipo}
                classifyTom={msg.classifyTom}
                classifyPontos={msg.classifyPontos}
                classifyProximo={msg.classifyProximo}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="glass-card rounded-t-none px-4 py-3">
        {sendError && (
          <div className="mb-2 px-3 py-2 rounded-lg text-xs text-red-300 bg-red-500/10 border border-red-500/20 flex items-center justify-between">
            <span>{sendError}</span>
            <button onClick={() => setSendError(null)} className="ml-2 text-red-400 hover:text-red-300">&times;</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Digite uma mensagem..."
            rows={1}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)',
              maxHeight: '120px',
              minHeight: '38px',
            }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !replyText.trim()}
            className="flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-all"
            style={{
              background: sending || !replyText.trim() ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.6)',
              color: sending || !replyText.trim() ? 'rgba(255,255,255,0.4)' : '#fff',
              border: '1px solid rgba(37,99,235,0.3)',
              minHeight: '38px',
            }}
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
