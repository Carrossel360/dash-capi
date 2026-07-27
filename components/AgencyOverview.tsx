'use client'
import { useEffect, useState, useCallback } from 'react'
import { DollarSign, Users, Calendar, Building2, Percent, Star, HeartHandshake, Wallet, AlertCircle, Layers } from 'lucide-react'
import PeriodSelector, { type Period } from '@/components/PeriodSelector'
import { useAuthStore } from '@/lib/store/auth'

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

interface ServiceCount { key: string; label: string; count: number }
interface Overview {
  leads: number; reunioes: number; clientesFechados: number; qtdClientesAtivos: number
  investimento: number; internalClientConfigured: boolean; services: ServiceCount[]; currency: string
}
const emptyOverview: Overview = {
  leads: 0, reunioes: 0, clientesFechados: 0, qtdClientesAtivos: 0,
  investimento: 0, internalClientConfigured: false, services: [], currency: 'BRL',
}

// Campos sem fonte automática no sistema hoje (item 4/12) — lançados manualmente via
// ManualMetric (service='agencia'), mesmo mecanismo já usado nos cards de Tráfego Pago.
const MANUAL_FIELDS: { key: string; label: string; suffix?: string }[] = [
  { key: 'qtd_ativos_tipo1', label: 'Clientes Ativos — Tipo 1 (Growth/MRR)' },
  { key: 'qtd_ativos_tipo2', label: 'Clientes Ativos — Tipo 2 (Retenção/Ticket)' },
  { key: 'ticket_medio_tipo1', label: 'Ticket Médio — Tipo 1', suffix: 'moeda' },
  { key: 'ltv', label: 'LTV', suffix: 'moeda' },
  { key: 'churn', label: 'Churn', suffix: '%' },
  { key: 'csat', label: 'CSAT (mensal)' },
  { key: 'nps', label: 'NPS (trimestral)' },
  { key: 'mrr', label: 'MRR atual', suffix: 'moeda' },
  { key: 'mrr_projetado', label: 'MRR projetado', suffix: 'moeda' },
  { key: 'custo_csp', label: 'Custo (CSP%)', suffix: '%' },
  { key: 'custo_mcb', label: 'Margem de Contribuição Bruta (MCB%)', suffix: '%' },
]

function Card({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: React.ElementType; color: string; sub?: string
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

function ManualInput({ metricKey, label, suffix, value, onSave }: {
  metricKey: string; label: string; suffix?: string; value: number | undefined
  onSave: (key: string, value: number) => void
}) {
  const [val, setVal] = useState(value != null ? String(value) : '')
  useEffect(() => { setVal(value != null ? String(value) : '') }, [value])
  return (
    <div className="glass rounded-xl p-4">
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-1.5 mt-1.5">
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={() => { const n = parseFloat(val); if (!isNaN(n)) onSave(metricKey, n) }}
          placeholder="—"
          className="w-full px-2.5 py-1.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]"
        />
        {suffix && <span className="text-[10px] text-slate-600 flex-shrink-0">{suffix === 'moeda' ? '' : suffix}</span>}
      </div>
    </div>
  )
}

export default function AgencyOverview() {
  const { token } = useAuthStore()
  const [period, setPeriod] = useState<Period>('this_month')
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [overview, setOverview] = useState<Overview>(emptyOverview)
  const [manual, setManual] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const periodKey = period === 'custom' && customRange ? `custom:${customRange.from}:${customRange.to}` : period

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const h = { Authorization: `Bearer ${token}` }
    const periodQs = period === 'custom' && customRange
      ? `period=custom&from=${customRange.from}&to=${customRange.to}`
      : `period=${period}`
    try {
      const [ovRes, manualRes] = await Promise.all([
        fetch(`/api/agency/overview?${periodQs}`, { headers: h }),
        fetch(`/api/manual-metrics?service=agencia&period=${encodeURIComponent(periodKey)}`, { headers: h }),
      ])
      const ov = ovRes.ok ? await ovRes.json() : emptyOverview
      const manualData = manualRes.ok ? await manualRes.json() : { overrides: {} }
      setOverview(ov)
      setManual(manualData.overrides ?? {})
    } catch { /* mantém zeros */ } finally {
      setLoading(false)
    }
  }, [token, period, customRange, periodKey])

  useEffect(() => { load() }, [load])

  async function saveManual(key: string, value: number) {
    setManual(prev => ({ ...prev, [key]: value })) // otimista
    if (!token) return
    try {
      await fetch('/api/manual-metrics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service: 'agencia', period: periodKey, metricKey: key, value }),
      })
    } catch { /* falha silenciosa — otimista já refletiu na tela */ }
  }

  const cac = overview.clientesFechados > 0 ? overview.investimento / overview.clientesFechados : 0
  const curr = overview.currency === 'USD' ? 'US$' : 'R$'

  return (
    <div className="space-y-6">
      <PeriodSelector value={period} onChange={p => { setPeriod(p); if (p !== 'custom') setCustomRange(null) }} onCustomChange={(from, to) => { setPeriod('custom'); setCustomRange({ from, to }) }} />

      {!loading && !overview.internalClientConfigured && (
        <div className="glass rounded-xl p-4 flex items-start gap-3" style={{ borderColor: 'rgba(245,163,20,0.4)' }}>
          <AlertCircle className="w-4 h-4 text-[#F5A314] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300">
            Nenhum cliente marcado como <strong className="text-white">&quot;Cliente interno da agência&quot;</strong> ainda — Investimento/Leads/Reuniões/Clientes ficam zerados até você cadastrar a Carrossel como cliente normal (Pipeline + Tráfego Pago dela) e marcar essa opção na aba Geral do cliente.
          </p>
        </div>
      )}

      {/* Comercial — auto-calculado a partir do pipeline/Tráfego Pago do cliente interno */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Comercial <span className="text-xs font-normal text-slate-500">(por período)</span></h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card label="Investimento" value={loading ? '—' : `${curr} ${fmt(overview.investimento)}`} icon={DollarSign} color="#8b5cf6" />
          <Card label="Leads" value={loading ? '—' : fmt(overview.leads)} icon={Users} color="#10b981" />
          <Card label="Reuniões" value={loading ? '—' : fmt(overview.reunioes)} icon={Calendar} color="#2575fc" sub="Leads no estágio marcado como reunião" />
          <Card label="Clientes" value={loading ? '—' : fmt(overview.clientesFechados)} icon={Building2} color="#F5A314" sub="Fechados no período" />
          <Card label="CAC" value={loading ? '—' : `${curr} ${fmt(cac)}`} icon={Percent} color="#ec4899" sub="Investimento ÷ Clientes" />
        </div>
      </div>

      {/* Sucesso */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Sucesso</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <Card label="Qtd. Clientes Ativos (total)" value={loading ? '—' : fmt(overview.qtdClientesAtivos)} icon={Star} color="#10b981" sub="Workspaces ativos, não arquivados" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MANUAL_FIELDS.slice(0, 6).map(f => (
            <ManualInput key={f.key} metricKey={f.key} label={f.label} suffix={f.suffix} value={manual[f.key]} onSave={saveManual} />
          ))}
        </div>
      </div>

      {/* Financeiro */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Financeiro <span className="text-xs font-normal text-slate-500">(lançamento manual — sem fonte automática hoje)</span></h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MANUAL_FIELDS.slice(6).map(f => (
            <ManualInput key={f.key} metricKey={f.key} label={f.label} suffix={f.suffix} value={manual[f.key]} onSave={saveManual} />
          ))}
        </div>
      </div>

      {/* Serviços contratados — contagem de clientes por serviço, puxado do catálogo */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#8b5cf6]" /> Serviços contratados <span className="text-xs font-normal text-slate-500">(qtd. de clientes ativos)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {overview.services.map(s => (
            <div key={s.key} className="glass rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-slate-400 truncate pr-2">{s.label}</span>
              <span className="text-sm font-bold text-white flex-shrink-0">{loading ? '—' : s.count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-slate-600 flex items-center gap-1.5">
        <HeartHandshake className="w-3 h-3" /> Investimento/Leads/Reuniões/Clientes vêm automaticamente do Pipeline e Tráfego Pago do cliente marcado como interno da agência. Os demais campos ficam salvos por período assim que você sai do campo.
        <Wallet className="w-3 h-3 ml-2" />
      </p>
    </div>
  )
}
