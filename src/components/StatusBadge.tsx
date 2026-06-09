import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

const statusConfig: Record<string, { label: string; dotColor: string; className: string }> = {
  APPROVED:  { label: 'Aprovado',  dotColor: '#10B981', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  PENDING:   { label: 'Pendente',  dotColor: '#F59E0B', className: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  REJECTED:  { label: 'Rejeitado', dotColor: '#EF4444', className: 'bg-red-500/15 text-red-300 border-red-500/25' },
  sent:      { label: 'Enviado',   dotColor: '#3B82F6', className: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
  delivered: { label: 'Entregue',  dotColor: '#10B981', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  read:      { label: 'Lido',      dotColor: '#06B6D4', className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
  failed:    { label: 'Falhou',    dotColor: '#EF4444', className: 'bg-red-500/15 text-red-300 border-red-500/25' },
  received:  { label: 'Recebido',  dotColor: '#94A3B8', className: 'bg-gray-500/15 text-gray-300 border-gray-500/25' },
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, dotColor: '#94A3B8', className: 'bg-gray-500/15 text-gray-300 border-gray-500/25' }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wider uppercase',
        config.className,
        size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.dotColor }} />
      {config.label}
    </span>
  )
}
