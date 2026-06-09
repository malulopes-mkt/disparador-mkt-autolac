import { cn } from '@/lib/utils'

interface ChatBubbleProps {
  body: string
  direction: string
  status?: string
  timestamp: string
  templateName?: string | null
  classifyTipo?: string | null
  classifyTom?: string | null
  classifyPontos?: string | null
  classifyProximo?: string | null
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'read') return <span className="text-cyan-400" title="Lido">&#10003;&#10003;</span>
  if (status === 'delivered') return <span className="text-gray-500" title="Entregue">&#10003;&#10003;</span>
  if (status === 'sent') return <span className="text-gray-600" title="Enviado">&#10003;</span>
  if (status === 'failed') return <span className="text-red-400" title="Falhou">&#10007;</span>
  return null
}

const tomColors: Record<string, string> = {
  positivo: 'text-emerald-400',
  neutro: 'text-gray-400',
  negativo: 'text-red-400',
}

const tipoLabels: Record<string, string> = {
  venda: 'Venda',
  suporte: 'Suporte',
  reclamacao: 'Reclamacao',
  outro: 'Outro',
}

export default function ChatBubble({ body, direction, status, timestamp, templateName, classifyTipo, classifyTom, classifyPontos, classifyProximo }: ChatBubbleProps) {
  const isOutbound = direction === 'outbound'
  const time = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const date = new Date(timestamp).toLocaleDateString('pt-BR')
  const hasClassification = classifyTipo || classifyTom

  return (
    <div className={cn('flex mb-3', isOutbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[75%]">
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5',
            isOutbound ? 'rounded-br-md' : 'rounded-bl-md'
          )}
          style={isOutbound ? {
            background: 'rgba(37,99,235,0.2)',
            border: '1px solid rgba(37,99,235,0.3)',
          } : {
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {templateName && (
            <p className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider mb-1">
              Template: {templateName}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap break-words text-gray-100">{body}</p>
          <div className={cn('flex items-center gap-1 mt-1', isOutbound ? 'justify-end' : 'justify-start')}>
            <span className="text-[10px] text-gray-500">{date} {time}</span>
            {isOutbound && <span className="text-[11px]"><StatusIcon status={status} /></span>}
          </div>
        </div>

        {hasClassification && (
          <div
            className="mt-1 px-3 py-2 rounded-lg text-[10px]"
            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              {classifyTipo && (
                <span className="text-cyan-300 font-semibold uppercase tracking-wider">
                  {tipoLabels[classifyTipo] || classifyTipo}
                </span>
              )}
              {classifyTom && (
                <span className={cn('font-medium', tomColors[classifyTom] || 'text-gray-400')}>
                  Tom: {classifyTom}
                </span>
              )}
            </div>
            {classifyPontos && (() => {
              try {
                const pontos = JSON.parse(classifyPontos) as string[]
                return pontos.length > 0 ? (
                  <p className="text-gray-400">{pontos.join(' · ')}</p>
                ) : null
              } catch { return null }
            })()}
            {classifyProximo && (
              <p className="text-blue-300 mt-0.5">Proximo: {classifyProximo}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
