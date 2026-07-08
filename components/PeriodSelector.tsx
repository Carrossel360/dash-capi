'use client'
import { useState } from 'react'
import { Calendar } from 'lucide-react'

export type Period = 'all' | '30d' | '7d' | 'yesterday' | 'today' | 'custom'

export const PERIOD_LABELS: Record<Period, string> = {
  all: 'Todo período',
  '30d': 'Últimos 30d',
  '7d': 'Últimos 7d',
  yesterday: 'Ontem',
  today: 'Hoje',
  custom: 'Personalizado',
}

const PERIODS: Period[] = ['all', '30d', '7d', 'yesterday', 'today', 'custom']

interface Props {
  value: Period
  onChange: (p: Period) => void
  onCustomChange?: (from: string, to: string) => void
}

export default function PeriodSelector({ value, onChange, onCustomChange }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const updateFrom = (v: string) => { setFrom(v); if (v && to) onCustomChange?.(v, to) }
  const updateTo = (v: string) => { setTo(v); if (from && v) onCustomChange?.(from, v) }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Calendar className="w-3.5 h-3.5 mr-0.5" style={{ color: '#6a11cb' }} />
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={
            value === p
              ? { background: '#6a11cb', color: '#fff', boxShadow: '0 2px 12px rgba(106,17,203,0.4)' }
              : { background: 'rgba(15,11,30,0.7)', color: '#94a3b8', border: '1px solid #1e1635' }
          }
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
      {value === 'custom' && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={from}
            onChange={e => updateFrom(e.target.value)}
            className="px-2 py-1.5 bg-[#1a1230] border border-[#2d2550] rounded-lg text-xs text-white focus:outline-none focus:border-[#6a11cb]"
          />
          <span className="text-slate-600 text-xs">–</span>
          <input
            type="date"
            value={to}
            onChange={e => updateTo(e.target.value)}
            className="px-2 py-1.5 bg-[#1a1230] border border-[#2d2550] rounded-lg text-xs text-white focus:outline-none focus:border-[#6a11cb]"
          />
        </div>
      )}
    </div>
  )
}
