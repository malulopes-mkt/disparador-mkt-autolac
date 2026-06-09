interface StatsCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
}

export default function StatsCard({ label, value, subtitle, icon }: StatsCardProps) {
  return (
    <div className="glass-card-glow p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-extrabold mt-2 text-gradient">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-blue-400" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}>
          {icon}
        </div>
      </div>
    </div>
  )
}
