'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Users, DollarSign, Share2, MapPin, ArrowUpRight, Loader2, Percent, Pencil, X, RotateCcw, Save } from 'lucide-react'
import TopBar from '@/components/TopBar'
import PeriodSelector, { type Period } from '@/components/PeriodSelector'
import AgencyOverview from '@/components/AgencyOverview'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/auth'
import toast from 'react-hot-toast'

const currencySymbol = (c?: string) => c === 'USD' ? 'US$' : 'R$'

interface DashData {
  metaSpend: number
  metaLeads: number
  googSpend: number
  googLeads: number
  crmLeads: number
  crmDeals: number
  igFollowers: number | null
  igReach: number
  igEngagement: number
  hasInstagram: boolean
  gbpViews: number | null
  gbpCalls: number | null
  gbpRating: number | null
  hasGbp: boolean
  hasReconciliation: boolean
}

interface MonthlyChartRow { mes: string; meta: number; google: number }

const empty: DashData = {
  metaSpend: 0, metaLeads: 0,
  googSpend: 0, googLeads: 0,
  crmLeads: 0, crmDeals: 0,
  igFollowers: null, igReach: 0, igEngagement: 0, hasInstagram: false,
  gbpViews: null, gbpCalls: null, gbpRating: null, hasGbp: false,
  hasReconciliation: false,
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

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function DashboardPage() {
  const { token, currentWorkspace, accessibleWorkspaces } = useAuthStore()
  // Visão Geral da Agência (item 12/vídeo) — só quem administra o workspace da própria
  // Carrossel (isAgency:true) vê os blocos Comercial/Sucesso/Financeiro em vez do dashboard
  // de KPIs de cliente. Mesma rota (/dashboard), conteúdo ramifica pelo contexto atual.
  const isAgencyAdmin = !!currentWorkspace?.isAgency && ['admin', 'manager'].includes(currentWorkspace?.role ?? '')
  const isMatriClient = currentWorkspace?.name?.toLowerCase().trim() === 'matri' || currentWorkspace?.slug === 'matri'
  const curr = currencySymbol(currentWorkspace?.currency)
  const canEditRevenue = accessibleWorkspaces.some(workspace => workspace.isAgency && ['admin', 'manager'].includes(workspace.role ?? ''))
  const [data, setData] = useState<DashData>(empty)
  const [monthlyChart, setMonthlyChart] = useState<MonthlyChartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30d')
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [specificMonth, setSpecificMonth] = useState('')
  const [view, setView] = useState<'geral' | 'detalhada'>('geral')
  const [manualRevenue, setManualRevenue] = useState<number | null>(null)
  const [revenueEditorOpen, setRevenueEditorOpen] = useState(false)
  const [revenueInput, setRevenueInput] = useState('')
  const [savingRevenue, setSavingRevenue] = useState(false)
  const [revenueReferenceType, setRevenueReferenceType] = useState<'month' | 'date'>('month')
  const [revenueReferenceMonth, setRevenueReferenceMonth] = useState(() => localDateKey().slice(0, 7))
  const [revenueReferenceDate, setRevenueReferenceDate] = useState(() => localDateKey())

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

  // Google Business é lançado manualmente por mês (YYYY-MM), não tem granularidade diária —
  // quando o período selecionado mapeia pra um mês exato (mês específico, "este mês", "mês
  // anterior"), busca esse mês certinho; caso contrário (7d/30d/todo período) não há um mês
  // único correspondente, então mostra o snapshot mais recente disponível.
  function periodToYearMonth(): string | null {
    if (specificMonth) return specificMonth
    const now = new Date()
    if (period === 'this_month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (period === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    return null
  }

  function reconciliationPeriod(): string {
    const now = new Date()
    return periodToYearMonth() ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  function manualRevenuePeriod(): string {
    const month = periodToYearMonth()
    if (month) return `month:${month}`
    if (period === 'custom' && customRange) {
      return customRange.from === customRange.to
        ? `date:${customRange.from}`
        : `custom:${customRange.from}:${customRange.to}`
    }
    if (period === 'today') return `date:${localDateKey()}`
    if (period === 'yesterday') {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return `date:${localDateKey(yesterday)}`
    }
    return period
  }

  function selectedRevenueReference(): string {
    return revenueReferenceType === 'month'
      ? `month:${revenueReferenceMonth}`
      : `date:${revenueReferenceDate}`
  }

  function openRevenueEditor() {
    const month = periodToYearMonth()
    if (month) {
      setRevenueReferenceType('month')
      setRevenueReferenceMonth(month)
    } else if (period === 'custom' && customRange && customRange.from === customRange.to) {
      setRevenueReferenceType('date')
      setRevenueReferenceDate(customRange.from)
    } else if (period === 'today' || period === 'yesterday') {
      const date = new Date()
      if (period === 'yesterday') date.setDate(date.getDate() - 1)
      setRevenueReferenceType('date')
      setRevenueReferenceDate(localDateKey(date))
    }
    setRevenueInput(String(revenue))
    setRevenueEditorOpen(true)
  }

  const load = useCallback(async () => {
    if (!token) return
    if (isAgencyAdmin) { setLoading(false); return } // AgencyOverview busca os próprios dados
    setLoading(true)
    const h = { Authorization: `Bearer ${token}` }
    const periodQs = period === 'custom' && customRange
      ? `period=custom&from=${customRange.from}&to=${customRange.to}`
      : `period=${period}`
    const ym = periodToYearMonth()
    const gbpUrl = ym ? `/api/google-business?period=${ym}` : '/api/google-business'
    try {
      const [metaRes, googRes, leadsRes, dealsRes, monthlyRes, socialRes, gbpRes, reconciliationRes, manualRevenueRes] = await Promise.all([
        fetch(`/api/trafego/meta?${periodQs}`, { headers: h }),
        fetch(`/api/trafego/google?${periodQs}`, { headers: h }),
        fetch(`/api/leads?${periodQs}`, { headers: h }),
        // Faturamento é contado por quando a VENDA fechou (closedAt), não por quando o lead
        // entrou (createdAt, usado acima só pra contar leads) — um lead de meses atrás que
        // fechou agora precisa entrar no faturamento do período, mesmo fora da janela de leads.
        fetch(`/api/leads?${periodQs}&dateField=closedAt`, { headers: h }),
        fetch('/api/dashboard/leads-by-month', { headers: h }),
        fetch(`/api/social-media?${periodQs}`, { headers: h }),
        fetch(gbpUrl, { headers: h }),
        isMatriClient
          ? fetch(`/api/leads-cruzamento?period=${reconciliationPeriod()}`, { headers: h })
          : Promise.resolve(null),
        fetch(`/api/manual-metrics?service=dashboard&period=${encodeURIComponent(manualRevenuePeriod())}`, { headers: h }),
      ])

      const meta = metaRes.ok ? await metaRes.json() : null
      const goog = googRes.ok ? await googRes.json() : null
      const leadsArr = leadsRes.ok ? await leadsRes.json() : []
      const dealsArr = dealsRes.ok ? await dealsRes.json() : []
      const monthly = monthlyRes.ok ? await monthlyRes.json() : null
      const social = socialRes.ok ? await socialRes.json() : null
      const gbp = gbpRes.ok ? await gbpRes.json() : null
      const reconciliation = reconciliationRes?.ok ? await reconciliationRes.json() : null
      const manualRevenueData = manualRevenueRes.ok ? await manualRevenueRes.json() : null

      const leads = Array.isArray(leadsArr) ? leadsArr : []
      const dealLeads = Array.isArray(dealsArr) ? dealsArr : []
      const crmDealsFromPipeline = dealLeads.reduce((s: number, l: { dealValue?: number }) => s + (l.dealValue ?? 0), 0)
      const reconciliationRevenue = Array.isArray(reconciliation?.rows)
        ? reconciliation.rows.reduce((s: number, r: { faturamento?: number }) => s + (r.faturamento ?? 0), 0)
        : 0
      const hasReconciliation = isMatriClient && reconciliationRevenue > 0
      const crmDeals = hasReconciliation ? reconciliationRevenue : crmDealsFromPipeline
      const savedManualRevenue = manualRevenueData?.overrides?.faturamento
      setManualRevenue(typeof savedManualRevenue === 'number' ? savedManualRevenue : null)

      // Sem `period` explícito, /api/google-business devolve os últimos 12 meses (mais antigo
      // primeiro) — pega o mais recente. Com `period`, devolve um único registro (ou null).
      const gbpRow = ym ? gbp?.data : (Array.isArray(gbp?.data) ? gbp.data[gbp.data.length - 1] : null)

      setData({
        metaSpend: meta?.kpis?.spend ?? 0,
        metaLeads: (meta?.kpis?.results ?? 0) + (meta?.kpis?.messaging_conversations_started ?? 0),
        googSpend: goog?.kpis?.spend ?? 0,
        googLeads: goog?.kpis?.conversions ?? 0,
        crmLeads: leads.length,
        crmDeals,
        igFollowers: social?.kpis?.followersTotal ?? null,
        igReach: social?.kpis?.reach ?? 0,
        igEngagement: social?.kpis?.accountsEngaged ?? 0,
        hasInstagram: social?.hasInstagram ?? false,
        gbpViews: gbpRow?.profileViews ?? null,
        gbpCalls: gbpRow?.phoneCalls ?? null,
        gbpRating: gbpRow?.averageStars ?? null,
        hasGbp: !!gbpRow,
        hasReconciliation,
      })
      setMonthlyChart(monthly?.chart ?? [])
    } catch { /* show zeros */ } finally {
      setLoading(false)
    }
  }, [token, period, customRange, specificMonth, isAgencyAdmin, isMatriClient]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function saveManualRevenue() {
    if (!revenueInput.trim()) { toast.error('Informe o faturamento'); return }
    const value = Number(revenueInput.replace(',', '.'))
    if (!Number.isFinite(value) || value < 0) { toast.error('Informe um valor válido'); return }
    if (revenueReferenceType === 'month' && !revenueReferenceMonth) { toast.error('Selecione o mês de referência'); return }
    if (revenueReferenceType === 'date' && !revenueReferenceDate) { toast.error('Selecione a data de referência'); return }
    const reference = selectedRevenueReference()
    setSavingRevenue(true)
    try {
      const res = await fetch('/api/manual-metrics', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'dashboard', period: reference, metricKey: 'faturamento', value }),
      })
      if (!res.ok) throw new Error()
      setManualRevenue(value)
      if (revenueReferenceType === 'month') {
        handleMonthPick(revenueReferenceMonth)
      } else {
        setSpecificMonth('')
        setPeriod('custom')
        setCustomRange({ from: revenueReferenceDate, to: revenueReferenceDate })
      }
      setRevenueEditorOpen(false)
      toast.success('Faturamento atualizado')
    } catch { toast.error('Erro ao atualizar faturamento') } finally { setSavingRevenue(false) }
  }

  async function restoreAutomaticRevenue() {
    setSavingRevenue(true)
    try {
      const params = new URLSearchParams({ service: 'dashboard', period: manualRevenuePeriod(), metricKey: 'faturamento' })
      const res = await fetch(`/api/manual-metrics?${params}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      setManualRevenue(null)
      setRevenueInput(String(data.crmDeals))
      setRevenueEditorOpen(false)
      toast.success('Cálculo automático restaurado')
    } catch { toast.error('Erro ao restaurar faturamento') } finally { setSavingRevenue(false) }
  }

  const totalSpend = data.metaSpend + data.googSpend
  const totalLeads = data.metaLeads + data.googLeads
  const revenue = manualRevenue ?? data.crmDeals
  // ROAS real = faturamento fechado no CRM ÷ investimento em tráfego pago — substitui o campo
  // manual/legado `metaRoas` (nunca era calculado de verdade, ver lib/trafego-aggregate.ts).
  const roas = totalSpend > 0 ? revenue / totalSpend : 0

  const kpis = [
    { label: 'Investimento', href: '/trafego-pago', value: `${curr} ${fmt(totalSpend)}`, icon: DollarSign, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)', sub: `Meta: ${curr}${fmt(data.metaSpend)} · Google: ${curr}${fmt(data.googSpend)}` },
    { label: 'Leads', href: '/trafego-pago', value: fmt(totalLeads), icon: Users, color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', sub: `Meta: ${data.metaLeads} · Google: ${data.googLeads}` },
    { label: 'Faturamento', href: data.hasReconciliation ? '/trafego-pago?tab=cruzamento' : '/pipeline', value: `${curr} ${fmt(revenue)}`, icon: DollarSign, color: '#F5A314', bg: 'rgba(245,163,20,0.1)', border: 'rgba(245,163,20,0.25)', sub: manualRevenue !== null ? 'Valor ajustado manualmente' : data.hasReconciliation ? 'Conciliação Matri' : 'Vendas marcadas no CRM', editable: true },
    { label: 'ROAS', href: data.hasReconciliation ? '/trafego-pago?tab=cruzamento' : '/pipeline', value: `${roas.toFixed(1)}x`, icon: Percent, color: '#2575fc', bg: 'rgba(37,117,252,0.1)', border: 'rgba(37,117,252,0.25)', sub: 'Faturamento ÷ Investimento' },
  ]

  const channels = [
    { label: 'Tráfego Pago', href: '/trafego-pago', icon: TrendingUp, color: '#8b5cf6', badge: 'Meta + Google',
      stats: [{ label: 'Gasto', value: `${curr}${fmt(totalSpend)}` }, { label: 'Leads', value: fmt(totalLeads) }, { label: 'ROAS', value: `${roas.toFixed(1)}x` }] },
    { label: data.hasReconciliation ? 'Cruzamento Matri' : 'CRM Pipeline', href: data.hasReconciliation ? '/trafego-pago?tab=cruzamento' : '/pipeline', icon: Users, color: '#10b981', badge: data.hasReconciliation ? 'Leads e Faturamento' : 'Leads e Vendas',
      stats: [{ label: 'Leads', value: String(data.crmLeads) }, { label: 'Vendas', value: `${curr}${fmt(revenue)}` }, { label: 'CAPI', value: '—' }] },
    { label: 'Social Media', href: '/social-media', icon: Share2, color: '#ec4899', badge: 'Instagram · Facebook',
      stats: [
        { label: 'Seguidores', value: data.hasInstagram && data.igFollowers != null ? fmt(data.igFollowers) : '—' },
        { label: 'Alcance', value: data.hasInstagram ? fmt(data.igReach) : '—' },
        { label: 'Eng.', value: data.hasInstagram ? fmt(data.igEngagement) : '—' },
      ] },
    { label: 'Google Business', href: '/google-business', icon: MapPin, color: '#10b981', badge: 'Meu Negócio',
      stats: [
        { label: 'Visualizações', value: data.gbpViews != null ? fmt(data.gbpViews) : '—' },
        { label: 'Ligações', value: data.gbpCalls != null ? fmt(data.gbpCalls) : '—' },
        { label: 'Avaliação', value: data.gbpRating != null ? `${data.gbpRating.toFixed(1)} ⭐` : '—' },
      ] },
  ]

  if (isAgencyAdmin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Visão Geral da Agência" />
        <main className="flex-1 overflow-y-auto p-5">
          <AgencyOverview />
        </main>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="" />
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex gap-1 p-1 bg-[#0f0b1e] rounded-xl border border-[#1e1635] w-fit">
            {([['geral', 'Visão Geral'], ['detalhada', 'Detalhada']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setView(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={view === key ? { background: '#6a11cb', color: '#fff' } : { background: 'transparent', color: '#94a3b8' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(({ label, href, value, icon: Icon, color, bg, border, sub, editable }) => (
            <div key={label} className="glass card-hover rounded-xl relative" style={{ borderColor: border, background: `linear-gradient(135deg, ${bg} 0%, rgba(10,8,24,0.9) 100%)` }}>
              <Link href={href} className="p-4 block">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                </div>
                <p className="text-xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                {sub && <p className={`text-[10px] mt-1 ${manualRevenue !== null && label === 'Faturamento' ? 'text-amber-400' : 'text-slate-600'}`}>{sub}</p>}
              </Link>
              {editable && canEditRevenue && (
                <button type="button" title="Editar faturamento"
                  onClick={openRevenueEditor}
                  className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-400 flex items-center justify-center hover:bg-amber-400/20 transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Channels */}
        {view === 'geral' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {channels.map(({ label, href, icon: Icon, color, badge, stats }) => (
              <Link key={href} href={href} className="glass card-hover rounded-xl p-4 block group" style={{ borderColor: `${color}30` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center theme-locked-accent" style={{ background: `${color}15` }}>
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
        )}

        {/* Detalhada — breakdown por canal, mesmos dados já buscados, sem chamada nova à API */}
        {view === 'detalhada' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e1635]">
                <h3 className="text-sm font-semibold text-white">Tráfego pago por canal</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1635]">
                    {['Canal', 'Investimento', 'Leads'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1e1635]/50">
                    <td className="px-4 py-3 text-white font-medium">Meta Ads</td>
                    <td className="px-4 py-3 text-slate-300">{curr} {fmt(data.metaSpend)}</td>
                    <td className="px-4 py-3 text-slate-300">{data.metaLeads}</td>
                  </tr>
                  <tr className="border-b border-[#1e1635]/50">
                    <td className="px-4 py-3 text-white font-medium">Google Ads</td>
                    <td className="px-4 py-3 text-slate-300">{curr} {fmt(data.googSpend)}</td>
                    <td className="px-4 py-3 text-slate-300">{data.googLeads}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-white font-semibold">Total</td>
                    <td className="px-4 py-3 text-white font-semibold">{curr} {fmt(totalSpend)}</td>
                    <td className="px-4 py-3 text-white font-semibold">{totalLeads}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="glass rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e1635]">
                <h3 className="text-sm font-semibold text-white">CRM e resultado</h3>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-[#1e1635]/50">
                    <td className="px-4 py-3 text-slate-400">Leads no CRM</td>
                    <td className="px-4 py-3 text-white font-semibold text-right">{data.crmLeads}</td>
                  </tr>
                  <tr className="border-b border-[#1e1635]/50">
                    <td className="px-4 py-3 text-slate-400">{data.hasReconciliation ? 'Faturamento (conciliação Matri)' : 'Faturamento (vendas marcadas)'}</td>
                    <td className="px-4 py-3 text-white font-semibold text-right">{curr} {fmt(revenue)}</td>
                  </tr>
                  <tr className="border-b border-[#1e1635]/50">
                    <td className="px-4 py-3 text-slate-400">Ticket médio</td>
                    <td className="px-4 py-3 text-white font-semibold text-right">
                      {curr} {fmt(data.crmLeads > 0 ? revenue / data.crmLeads : 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-400">ROAS (faturamento ÷ investimento)</td>
                    <td className="px-4 py-3 text-white font-semibold text-right">{roas.toFixed(1)}x</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

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

        {revenueEditorOpen && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 theme-locked-modal">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setRevenueEditorOpen(false)} />
            <div className="relative w-full max-w-sm rounded-xl border border-[#2d2550] p-5 shadow-2xl space-y-4" style={{ background: '#0d0a1f' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Editar faturamento</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Ajuste válido somente para o período selecionado.</p>
                </div>
                <button onClick={() => setRevenueEditorOpen(false)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="text-xs text-slate-400">Referência</label>
                <div className="grid grid-cols-2 gap-1 mt-1.5 p-1 rounded-lg bg-[#15102a] border border-[#2d2550]">
                  {(['month', 'date'] as const).map(type => (
                    <button key={type} type="button" onClick={() => setRevenueReferenceType(type)}
                      className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${revenueReferenceType === type ? 'bg-[#6a11cb] text-white' : 'text-slate-400 hover:text-white'}`}>
                      {type === 'month' ? 'Mês' : 'Data'}
                    </button>
                  ))}
                </div>
                <input
                  type={revenueReferenceType === 'month' ? 'month' : 'date'}
                  value={revenueReferenceType === 'month' ? revenueReferenceMonth : revenueReferenceDate}
                  onChange={event => revenueReferenceType === 'month' ? setRevenueReferenceMonth(event.target.value) : setRevenueReferenceDate(event.target.value)}
                  className="w-full mt-2 px-3 py-2.5 rounded-lg bg-[#1e1635] border border-[#2d2550] text-white outline-none focus:border-[#6a11cb]"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Valor ({curr})</label>
                <input type="number" min="0" step="0.01" autoFocus value={revenueInput} onChange={event => setRevenueInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') saveManualRevenue() }}
                  className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-[#1e1635] border border-[#2d2550] text-white outline-none focus:border-[#6a11cb]" />
                <p className="text-[10px] text-slate-600 mt-1.5">Cálculo automático atual: {curr} {data.crmDeals.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="flex items-center gap-2">
                {manualRevenue !== null && (
                  <button onClick={restoreAutomaticRevenue} disabled={savingRevenue}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2d2550] text-xs text-slate-400 hover:text-white disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Automático
                  </button>
                )}
                <button onClick={saveManualRevenue} disabled={savingRevenue}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg gradient-brand text-xs font-semibold text-white disabled:opacity-50">
                  {savingRevenue ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
