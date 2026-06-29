'use client'
import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, Zap, Copy } from 'lucide-react'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import toast from 'react-hot-toast'

interface CAPIEvent {
  id: string
  eventName: string
  source: string
  status: 'sent' | 'failed' | 'queued'
  matchQuality: number | null
  attempts: number
  sentAt: string | null
  createdAt: string
  lead: { id: string; name: string; phone: string | null } | null
}

interface Summary { status: string; _count: number }

const statusConfig = {
  sent:   { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Enviado' },
  failed: { icon: XCircle,    color: 'text-red-400',     bg: 'bg-red-400/10',     label: 'Falhou'  },
  queued: { icon: Clock,      color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Na fila' },
} as const

const eventColors: Record<string, string> = {
  Purchase: '#10b981', Lead: '#8b5cf6', PageView: '#2575fc',
  ViewContent: '#06b6d4', WhatsAppClick: '#25d366', FormSubmit: '#f59e0b',
}

function QualityBar({ value }: { value: number }) {
  const color = value >= 8 ? '#10b981' : value >= 6 ? '#f59e0b' : value >= 4 ? '#f97316' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#1e1635] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(value / 10) * 100}%`, background: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  )
}

export default function EventsPage() {
  const { token, currentWorkspace } = useAuthStore()
  const [events, setEvents]   = useState<CAPIEvent[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [filter, setFilter]   = useState<'all' | 'sent' | 'failed' | 'queued'>('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const q = filter !== 'all' ? `?status=${filter}&limit=100` : '?limit=100'
      const res = await fetch(`/api/events${q}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEvents(data.events ?? [])
      setSummary(data.summary ?? [])
    } catch {
      toast.error('Erro ao carregar eventos')
    } finally {
      setLoading(false)
    }
  }, [token, filter])

  useEffect(() => { load() }, [load])

  const count = (s: string) => summary.find(x => x.status === s)?._count ?? 0
  const sentCount   = count('sent')
  const failedCount = count('failed')
  const queuedCount = count('queued')
  const totalCount  = sentCount + failedCount + queuedCount

  const qualities = events.map(e => e.matchQuality).filter((q): q is number => q != null)
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 0

  const scriptUrl = currentWorkspace
    ? `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/t/${currentWorkspace.id}`
    : '...'

  function copyScript() {
    navigator.clipboard.writeText(`<script src="${scriptUrl}" async></script>`)
    toast.success('Script copiado!')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Eventos CAPI" />
      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: totalCount,  color: '#8b5cf6', icon: Zap },
            { label: 'Enviados', value: sentCount, color: '#10b981', icon: CheckCircle },
            { label: 'Falhas',   value: failedCount, color: '#ef4444', icon: XCircle },
            { label: 'Na fila',  value: queuedCount, color: '#f59e0b', icon: Clock },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Avg quality */}
        {avgQuality > 0 && (
          <div className={`glass rounded-xl px-4 py-3 flex items-center justify-between ${avgQuality < 7 ? 'border-amber-500/30' : 'border-emerald-500/20'}`}>
            <div className="flex items-center gap-2">
              {avgQuality < 7
                ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                : <CheckCircle className="w-4 h-4 text-emerald-400" />}
              <span className="text-sm text-slate-300">Match Quality Médio</span>
              {avgQuality < 7 && <span className="text-xs text-amber-400">— adicione email e telefone nos leads para melhorar</span>}
            </div>
            <QualityBar value={avgQuality} />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {(['all', 'sent', 'failed', 'queued'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${filter === f ? 'gradient-brand text-white' : 'bg-[#1e1635] text-slate-400 hover:text-white'}`}>
                {f === 'all' ? 'Todos' : f === 'sent' ? 'Enviados' : f === 'failed' ? 'Falhas' : 'Na fila'}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* Table */}
        <div className="glass rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-[#8b5cf6] animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              Nenhum evento encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1635]">
                    {['Evento','Lead','Fonte','Status','Match Quality','Tentativas','Enviado em'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const cfg = statusConfig[event.status] ?? statusConfig.queued
                    const { icon: StatusIcon, color, bg, label } = cfg
                    const eventColor = eventColors[event.eventName] ?? '#8b5cf6'
                    return (
                      <tr key={event.id} className="border-b border-[#1e1635]/50 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color: eventColor, background: `${eventColor}18` }}>
                            {event.eventName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{event.lead?.name ?? '—'}</p>
                          {event.lead?.phone && <p className="text-slate-500">{event.lead.phone}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-400 bg-[#1e1635] px-1.5 py-0.5 rounded">{event.source}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full ${bg} ${color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {label}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {event.matchQuality != null
                            ? <QualityBar value={event.matchQuality} />
                            : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{event.attempts}x</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {event.sentAt
                            ? new Date(event.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Script embed */}
        <div className="glass rounded-xl p-4 border-[#6a11cb]/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white">Script de rastreamento</p>
            <button onClick={copyScript} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
              <Copy className="w-3 h-3" /> Copiar
            </button>
          </div>
          <code className="text-xs text-[#8b5cf6] block bg-[#080612] rounded-lg p-3 overflow-x-auto">
            {`<script src="${scriptUrl}" async></script>`}
          </code>
          <p className="text-xs text-slate-500 mt-2">Insira no &lt;head&gt; do site para capturar PageView, Lead, Purchase e mais.</p>
        </div>

      </main>
    </div>
  )
}
