'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Users, DollarSign, Share2, MapPin, ArrowUpRight, Loader2 } from 'lucide-react'
import TopBar from '@/components/TopBar'
import PeriodSelector, { type Period } from '@/components/PeriodSelector'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/auth'

const currencySymbol = (c?: string) => c === 'USD' ? 'US$' : 'R$'

interface DashData {
  metaSpend: number
  metaLeads: number
  metaRoas: number
  googSpend: number
  googLeads: number
  crmLeads: number
  crmDeals: number
}

interface MonthlyChartRow { mes: string; meta: number; google: number }

const empty: DashData = {
  metaSpend: 0, metaLeads: 0, metaRoas: 0,
  googSpend: 0, googLeads: 0,
  crmLeads: 0, crmDeals: 0,
}

const Tt = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-semibold text-white">{p.value}</span></p>
      ))}
    </div>
  )
}

function fmt(n: number, prefix = '') {
  if (n >= 1000) return `${prefix}${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return `${prefix}${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

// Últimos 12 meses calendário (mais recente primeiro) — usado pro seletor "mês a mês".
function lastMonths(n: number): { key: string; label: string }[] {
  const now = new Date()
  const out: { key: string; label: string }[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    out.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return out
}

export default function DashboardPage() {
  const { token, currentWorkspace } = useAuthStore()
  const curr = currencySymbol(currentWorkspace?.currency)
  const [data, setData] = useState<DashData>(empty)
  const [monthlyChart, setMonthlyChart] = useState<MonthlyChartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30d')
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [specificMonth, setSpecificMonth] = useState('')

  const monthOptions = useMemo(() => lastMonths(12), [])

  function handlePeriodChange(p: Period) {
    setPeriod(p)
    setSpecificMonth('')
    if (p !== 'custom') setCustomRange(null)
  }

  function handleMonthPick(key: string) {
    setSpecificMonth(key)
    if (!key) return
    const [y, m] = key.split('-').map(Number)
    const from = new Date(y, m - 1, 1).toISOString().slice(0, 10)
    const to = new Date(y, m, 0).toISOString().slice(0, 10)
    setPeriod('custom')
    setCustomRange({ from, to })
  }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const h = { Authorization: `Bearer ${token}` }
    const periodQs = period === 'custom' && customRange
      ? `period=custom&from=${customRange.from}&to=${customRange.to}`
      : `period=${period}`
    try {
      const [metaRes, googRes, leadsRes, monthlyRes] = await Promise.all([
        fetch(`/api/trafego/meta?${periodQs}`, { headers: h }),
        fetch(`/api/trafego/google?${periodQs}`, { headers: h }),
        fetch(`/api/leads?${periodQs}`, { headers: h }),
        fetch('/api/dashboard/leads-by-month', { headers: h }),
      ])

      const meta = metaRes.ok ? await metaRes.json() : null
      const goog = googRes.ok ? await googRes.json() : null
      const leadsArr = leadsRes.ok ? await leadsRes.json() : []
      const monthly = monthlyRes.ok ? await monthlyRes.json() : null

      const leads = Array.isArray(leadsArr) ? leadsArr : []
      const crmDeals = leads.reduce((s: number, l: { dealValue?: number }) => s + (l.dealValue ?? 0), 0)

      setData({
        metaSpend: meta?.kpis?.spend ?? 0,
        metaLeads: (meta?.kpis?.results ?? 0) + (meta?.kpis?.messaging_conversations_started ?? 0),
        metaRoas:  meta?.kpis?.roas ?? 0,
        googSpend: goog?.kpis?.spend ?? 0,
        googLeads: goog?.kpis?.conversions ?? 0,
        crmLeads: leads.length,
        crmDeals,
      })
      setMonthlyChart(monthly?.chart ?? [])
    } catch { /* show zeros */ } finally {
      setLoading(false)
    }
  }, [token, period, customRange]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const totalSpend = data.metaSpend + data.googSpend
  const totalLeads = data.metaLeads + data.googLeads

  const kpis = [
    { label: 'Investimento Total', href: '/trafego-pago', value: `${curr} ${fmt(totalSpend)}`, icon: DollarSign, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)', sub: `Meta: ${curr}${fmt(data.metaSpend)} · Google: ${curr}${fmt(data.googSpend)}` },
    { label: 'Leads Gerados', href: '/trafego-pago', value: fmt(totalLeads), icon: Users, color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', sub: `Meta: ${data.metaLeads} · Google: ${data.googLeads}` },
    { label: 'Leads CRM', href: '/pipeline', value: String(data.crmLeads), icon: Share2, color: '#2575fc', bg: 'rgba(37,117,252,0.1)', border: 'rgba(37,117,252,0.25)', sub: `${curr} ${fmt(data.crmDeals)} em vendas` },
    { label: 'Faturamento', href: '/pipeline', value: `${curr} ${fmt(data.crmDeals)}`, icon: DollarSign, color: '#F5A314', bg: 'rgba(245,163,20,0.1)', border: 'rgba(245,163,20,0.25)', sub: 'Vendas marcadas no CRM' },
  ]

  const channels = [
    { label: 'Tráfego Pago', href: '/trafego-pago', icon: TrendingUp, color: '#8b5cf6', badge: 'Meta + Google',
      stats: [{ label: 'Gasto', value: `${curr}${fmt(totalSpend)}` }, { label: 'Leads', value: fmt(totalLeads) }, { label: 'ROAS', value: `${(data.metaRoas).toFixed(1)}x` }] },
    { label: 'CRM Pipeline', href: '/pipeline', icon: Users, color: '#10b981', badge: 'Leads e Vendas',
      stats: [{ label: 'Leads', value: String(data.crmLeads) }, { label: 'Vendas', value: `${curr}${fmt(data.crmDeals)}` }, { label: 'CAPI', value: '—' }] },
    { label: 'Social Media', href: '/social-media', icon: Share2, color: '#ec4899', badge: 'Instagram · Facebook',
      stats: [{ label: 'Seguidores', value: '—' }, { label: 'Alcance', value: '—' }, { label: 'Eng.', value: '—' }] },
    { label: 'Google Business', href: '/google-business', icon: MapPin, color: '#10b981', badge: 'Meu Negócio',
      stats: [{ label: 'Visualizações', value: '—' }, { label: 'Ligações', value: '—' }, { label: 'Avaliação', value: '—' }] },
  ]

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Dashboard" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Período */}
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector value={period} onChange={handlePeriodChange} onCustomChange={(from, to) => { setPeriod('custom'); setCustomRange({ from, to }) }} />
          <select
            value={specificMonth}
            onChange={e => handleMonthPick(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0f0b1e] border border-[#2d2550] text-white focus:outline-none focus:border-[#6a11cb]"
          >
            <option value="">Escolher mês específico…</option>
            {monthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(({ label, href, value, icon: Icon, color, bg, border, sub }) => (
            <Link key={label} href={href} className="glass card-hover rounded-xl p-4 block" style={{ borderColor: border, background: `linear-gradient(135deg, ${bg} 0%, rgba(10,8,24,0.9) 100%)` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
              </div>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              {sub && <p className="text-[10px] text-slate-600 mt-1">{sub}</p>}
            </Link>
          ))}
        </div>

        {/* Channels */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map(({ label, href, icon: Icon, color, badge, stats }) => (
            <Link key={href} href={href} className="glass card-hover rounded-xl p-4 block group" style={{ borderColor: `${color}30` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <span className="text-xs font-semibold text-white">{label}</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
              </div>
              <span className="text-[10px] text-slate-500 bg-[#1e1635] px-1.5 py-0.5 rounded-full">{badge}</span>
              <div className="grid grid-cols-3 gap-1 mt-3">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-xs font-semibold text-white">{s.value}</p>
                    <p className="text-[10px] text-slate-600">{s.label}</p>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        {/* Chart — últimos 12 meses, fixo, independente do período escolhido acima */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Leads por mês</h2>
              <p className="text-xs text-slate-500 mt-0.5">Meta Ads + Google Ads · últimos 12 meses</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />Meta</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]" />Google</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyChart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="gm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
              <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tt />} />
              <Area type="monotone" dataKey="meta" name="Meta" stroke="#8b5cf6" strokeWidth={2} fill="url(#gm)" />
              <Area type="monotone" dataKey="google" name="Google" stroke="#10b981" strokeWidth={2} fill="url(#gg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </main>
    </div>
  )
}
