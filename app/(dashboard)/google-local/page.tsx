'use client'
import { useState, useEffect } from 'react'
import {
  Star, Phone, PhoneCall, DollarSign, Users, Wallet, MessageCircle,
  Loader2, RefreshCw, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

type Period = 'this_month' | 'last_month' | 'all'

const PERIOD_OPTS: { value: Period; label: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'all',        label: 'Todo período' },
]

interface Kpis {
  hasData: boolean
  businessName?: string | null
  totalCost?: number
  chargedLeads?: number
  phoneCalls?: number
  connectedPhoneCalls?: number
  averageWeeklyBudget?: number | null
  averageFiveStarRating?: number | null
  totalReview?: number | null
  phoneLeadResponsiveness?: number | null
  costPerLead?: number
  updatedAt?: string
}

function currencySymbol(c: string) { return c === 'USD' ? 'US$' : 'R$' }

function MetricCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="glass card-hover rounded-xl p-4">
      <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

export default function GoogleLocalPage() {
  const { token } = useAuthStore()
  const [period, setPeriod] = useState<Period>('this_month')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [hasAccount, setHasAccount] = useState(true)
  const [currency, setCurrency] = useState('BRL')
  const [kpis, setKpis] = useState<Kpis>({ hasData: false })

  function load() {
    if (!token) return
    setLoading(true)
    fetch(`/api/google-local?period=${period}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? 'Erro ao buscar dados') }))
      .then(d => {
        setHasAccount(d.hasAccount ?? true)
        setCurrency(d.currency ?? 'BRL')
        setKpis(d.kpis ?? { hasData: false })
      })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Erro ao buscar dados'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token, period]) // eslint-disable-line

  async function handleSync() {
    if (!token) return
    setSyncing(true)
    try {
      const res = await fetch('/api/google-local/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha ao sincronizar')
      if (data.result?.error) throw new Error(data.result.error)
      toast.success('Local Services atualizado')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const curr = currencySymbol(currency)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Google Local Service Ads" />
      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 p-1 bg-[#0f0b1e] rounded-xl border border-[#1e1635] w-fit">
            {PERIOD_OPTS.map(opt => (
              <button key={opt.value} onClick={() => setPeriod(opt.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={period === opt.value
                  ? { background: '#6a11cb', color: '#fff' }
                  : { background: 'transparent', color: '#94a3b8' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#1e1635] hover:text-white hover:border-[#6a11cb] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Atualizar agora
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
          </div>
        )}

        {!loading && !hasAccount && (
          <div className="glass rounded-2xl p-8 max-w-sm text-center mx-auto">
            <div className="w-14 h-14 rounded-xl bg-[#4285f4]/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-[#4285f4]" />
            </div>
            <h2 className="text-sm font-bold text-white mb-2">Sem conta configurada</h2>
            <p className="text-xs text-slate-500">
              Esse cliente ainda não tem uma conta de Local Services Ads vinculada. Fale com a agência pra configurar.
            </p>
          </div>
        )}

        {!loading && hasAccount && !kpis.hasData && (
          <div className="glass rounded-xl px-4 py-3 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20">
            Nenhum dado sincronizado para este período ainda. Clique em &quot;Atualizar agora&quot;.
          </div>
        )}

        {!loading && hasAccount && kpis.hasData && (
          <>
            {kpis.businessName && (
              <p className="text-xs text-slate-500">
                Conta: <span className="text-slate-300 font-medium">{kpis.businessName}</span>
              </p>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Valor Gasto" value={`${curr} ${(kpis.totalCost ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} color="#ef4444" />
              <MetricCard label="Leads Cobrados" value={String(kpis.chargedLeads ?? 0)} icon={Users} color="#10b981" />
              <MetricCard label="Custo por Lead" value={`${curr} ${(kpis.costPerLead ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={Wallet} color="#F5A314" />
              <MetricCard label="Orçamento Semanal Médio" value={kpis.averageWeeklyBudget != null ? `${curr} ${kpis.averageWeeklyBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'} icon={DollarSign} color="#6a11cb" />
              <MetricCard label="Ligações" value={String(kpis.phoneCalls ?? 0)} icon={Phone} color="#2575fc" />
              <MetricCard label="Ligações Atendidas" value={String(kpis.connectedPhoneCalls ?? 0)} icon={PhoneCall} color="#2575fc" />
              <MetricCard label="Taxa de Resposta" value={kpis.phoneLeadResponsiveness != null ? `${(kpis.phoneLeadResponsiveness * 100).toFixed(0)}%` : '-'} icon={MessageCircle} color="#8b5cf6" />
              <MetricCard label="Avaliação" value={kpis.averageFiveStarRating != null ? `⭐ ${kpis.averageFiveStarRating.toFixed(1)} (${kpis.totalReview ?? 0})` : '-'} icon={Star} color="#F5A314" />
            </div>
          </>
        )}

      </main>
    </div>
  )
}
