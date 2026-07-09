'use client'
import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

export type Period = 'all' | '30d' | '7d' | 'yesterday' | 'today' | 'this_month' | 'last_month' | 'custom'

export const PERIOD_LABELS: Record<Period, string> = {
  this_month: 'Este mês',
  last_month: 'Mês anterior',
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7d',
  '30d': 'Últimos 30d',
  all: 'Todo período',
  custom: 'Personalizado',
}

const PERIODS: Period[] = ['this_month', 'last_month', 'today', 'yesterday', '7d', '30d', 'all', 'custom']

interface Props {
  value: Period
  onChange: (p: Period) => void
  onCustomChange?: (from: string, to: string) => void
}

export default function PeriodSelector({ value, onChange, onCustomChange }: Props) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const updateFrom = (v: string) => { setFrom(v); if (v && to) onCustomChange?.(v, to) }
  const updateTo = (v: string) => { setTo(v); if (from && v) onCustomChange?.(from, v) }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(15,11,30,0.7)', color: '#fff', border: '1px solid #2d2550' }}
        >
          <Calendar className="w-3.5 h-3.5" style={{ color: '#6a11cb' }} />
          {PERIOD_LABELS[value]}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 top-10 z-50 w-44 bg-[#0f0b1e] border border-[#2d2550] rounded-xl shadow-2xl overflow-hidden py-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => { onChange(p); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[#1e1635] ${value === p ? 'text-[#8b5cf6] font-semibold' : 'text-slate-300'}`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>
      {value === 'custom' && (
        <div className="flex items-center gap-2">
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
