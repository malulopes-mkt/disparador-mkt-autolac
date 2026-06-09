'use client'

import { useEffect, useState, useRef, use } from 'react'
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
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function fetchMessages() {
      fetch(`/api/messages?phone=${encodeURIComponent(decodedPhone)}&limit=100`)
        .then(r => r.json())
        .then(data => {
          const sorted = [...(data.messages || [])].sort(
            (a: Message, b: Message) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
          setMessages(sorted)
          setLoading(false)
        })
    }

    fetchMessages()
    const interval = setInterval(fetchMessages, 10000)
    return () => clearInterval(interval)
  }, [decodedPhone])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

      <div className="glass-card rounded-t-none px-5 py-3">
        <p className="text-xs text-gray-600 text-center">
          Mensagens ativas sao enviadas via templates configurados nos gatilhos. Respostas do contato aparecem automaticamente.
        </p>
      </div>
    </div>
  )
}
