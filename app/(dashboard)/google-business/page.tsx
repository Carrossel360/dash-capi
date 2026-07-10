'use client'
import { useState, useEffect, useCallback } from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  MapPin, Star, Phone, Navigation, Globe, MessageSquare, Zap,
  Eye, Search, Map, TrendingUp, FileText, Edit3, Check, X, Award, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

interface GbpKeyword { keyword: string; position: number | string; searches: number | string }
interface GbpRow {
  period: string
  profileViews: number | null; phoneCalls: number | null; routeRequests: number | null
  websiteVisits: number | null; chatMessages: number | null; whatsappClicks: number | null
  googleSearchViews: number | null; googleMapsViews: number | null
  totalReviews: number | null; averageStars: number | null; newReviewsThisMonth: number | null
  reviewsWithoutComments: number | null; likesPositiveReviews: number | null; likesNegativeReviews: number | null
  totalCitations: number | null; routeSimulations: number | null; postsThisMonth: number | null
  profileRating: number | null
  keywords: GbpKeyword[] | null
  observations: string | null
}

function monthLabel(period: string) {
  const [y, m] = period.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

/* ── Manual Edit Modal ── */
function ManualEditModal({ metric, value, onSave, onClose }: {
  metric: string; value: string; onSave: (v: string) => void; onClose: () => void
}) {
  const [val, setVal] = useState(value)
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl p-5 w-full max-w-xs shadow-2xl z-10"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>
        <h3 className="text-sm font-bold text-white mb-1">Editar manualmente</h3>
        <p className="text-xs text-slate-500 mb-3">{metric}</p>
        <input value={val} onChange={e => setVal(e.target.value)} type="number"
          className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] mb-3" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-[#2d2550] text-slate-400 text-xs hover:text-white">Cancelar</button>
          <button onClick={() => { onSave(val); onClose() }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1"
            style={{ background: '#6a11cb' }}>
            <Check className="w-3.5 h-3.5" /> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon, color, onEdit }: {
  label: string; value: string | number; icon: React.ElementType
  color: string; onEdit?: () => void
}) {
  return (
    <div className="glass card-hover rounded-xl p-4 group relative">
      {onEdit && (
        <button onClick={onEdit}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-[#6a11cb]"
          title="Editar manualmente">
          <Edit3 className="w-3 h-3" />
        </button>
      )}
      <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

const Tt = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-semibold text-white">{p.value}</span></p>)}
    </div>
  )
}

export default function GoogleBusinessPage() {
  const { token } = useAuthStore()
  const [months, setMonths] = useState<GbpRow[]>([])
  const [period, setPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [manualEdit, setManualEdit] = useState<{ key: string; label: string } | null>(null)

  const h = { Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/google-business', { headers: h })
      const json = await res.json()
      const rows: GbpRow[] = json.data ?? []
      setMonths(rows)
      setPeriod(p => (p && rows.some(r => r.period === p)) ? p : (rows[rows.length - 1]?.period ?? '')
      )
    } finally { setLoading(false) }
  }, [token]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const current = months.find(m => m.period === period) ?? null
  const val = (k: keyof GbpRow) => (current?.[k] as number | null) ?? 0
  const str = (k: keyof GbpRow, suffix?: string) => `${val(k).toLocaleString('pt-BR')}${suffix ?? ''}`
  const edit = (key: string, label: string) => setManualEdit({ key, label })

  async function saveMetric(key: string, v: string) {
    if (!period) { toast.error('Selecione um mês'); return }
    const res = await fetch('/api/google-business', {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, [key]: parseFloat(v) || 0 }),
    })
    if (res.ok) { toast.success('Salvo'); load() } else toast.error('Erro ao salvar')
  }

  const totalInteractions = val('phoneCalls') + val('routeRequests') + val('websiteVisits') + val('chatMessages') + val('whatsappClicks')

  const keywords = current?.keywords ?? []
  const validKeywords = keywords.filter(k => k.keyword && k.keyword !== '-')
  const avgPosition = validKeywords.length > 0
    ? (validKeywords.reduce((s, k) => s + (Number(k.position) || 0), 0) / validKeywords.length)
    : 0
  const totalSearches = validKeywords.reduce((s, k) => s + (Number(k.searches) || 0), 0)

  const chartData = months.map(m => ({
    mes: monthLabel(m.period),
    views: m.profileViews ?? 0,
    interactions: (m.phoneCalls ?? 0) + (m.routeRequests ?? 0) + (m.websiteVisits ?? 0) + (m.chatMessages ?? 0) + (m.whatsappClicks ?? 0),
  }))

  return (
    <>
      {manualEdit && (
        <ManualEditModal
          metric={manualEdit.label}
          value={String(val(manualEdit.key as keyof GbpRow))}
          onSave={(v) => saveMetric(manualEdit.key, v)}
          onClose={() => setManualEdit(null)}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Google Business Profile" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Month selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Mês:</span>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0f0b1e] border border-[#1e1635] text-white focus:outline-none focus:border-[#6a11cb]">
              {months.length === 0 && <option value="">Sem dados</option>}
              {months.map(m => <option key={m.period} value={m.period}>{monthLabel(m.period)}</option>)}
            </select>
            {loading && <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
          </div>

          {!loading && months.length === 0 && (
            <div className="glass rounded-xl p-8 text-center text-sm text-slate-500">
              Nenhum dado de Google Business ainda. Clique no lápis de cada métrica pra começar a preencher manualmente.
            </div>
          )}

          {months.length > 0 && (
            <>
              {/* ── Visão Geral ── */}
              <div>
                <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" style={{ color: '#6a11cb' }} /> Visão Geral — Google Meu Negócio
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricCard label="Visualizações do Perfil" value={str('profileViews')} icon={Eye} color="#6a11cb" onEdit={() => edit('profileViews', 'Visualizações do Perfil')} />
                  <MetricCard label="Total de Interações" value={totalInteractions.toLocaleString('pt-BR')} icon={TrendingUp} color="#8b5cf6" />
                  <MetricCard label="Média de Avaliações" value={`${str('averageStars')} ⭐`} icon={Star} color="#F5A314" onEdit={() => edit('averageStars', 'Média de Estrelas')} />
                  <MetricCard label="Nota do Perfil" value={str('profileRating')} icon={Award} color="#10b981" onEdit={() => edit('profileRating', 'Nota do Perfil')} />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
                  <MetricCard label="Chamadas" value={str('phoneCalls')} icon={Phone} color="#2575fc" onEdit={() => edit('phoneCalls', 'Chamadas')} />
                  <MetricCard label="Pedidos de Rota" value={str('routeRequests')} icon={Navigation} color="#8b5cf6" onEdit={() => edit('routeRequests', 'Pedidos de Rota')} />
                  <MetricCard label="Visitas ao Site" value={str('websiteVisits')} icon={Globe} color="#10b981" onEdit={() => edit('websiteVisits', 'Visitas ao Site')} />
                  <MetricCard label="Mensagens Chat" value={str('chatMessages')} icon={MessageSquare} color="#6a11cb" onEdit={() => edit('chatMessages', 'Mensagens Chat')} />
                  <MetricCard label="Cliques WhatsApp" value={str('whatsappClicks')} icon={Zap} color="#F5A314" onEdit={() => edit('whatsappClicks', 'Cliques WhatsApp')} />
                </div>
              </div>

              {/* Chart — últimos 12 meses */}
              <div className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-4">Visualizações & Interações — últimos meses</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gvb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6a11cb" stopOpacity={0.3} /><stop offset="95%" stopColor="#6a11cb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                    <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tt />} />
                    <Area type="monotone" dataKey="views" name="Visualizações" stroke="#6a11cb" strokeWidth={2} fill="url(#gvb)" />
                    <Area type="monotone" dataKey="interactions" name="Interações" stroke="#8b5cf6" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ── Visualizações por origem ── */}
              <div className="glass rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Eye className="w-4 h-4" style={{ color: '#6a11cb' }} /> Visualizações
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Visualizações do Perfil" value={str('profileViews')} icon={Eye} color="#6a11cb" onEdit={() => edit('profileViews', 'Visualizações do Perfil')} />
                  <MetricCard label="Via Buscador Google" value={str('googleSearchViews')} icon={Search} color="#8b5cf6" onEdit={() => edit('googleSearchViews', 'Via Buscador Google')} />
                  <MetricCard label="Via Google Maps" value={str('googleMapsViews')} icon={Map} color="#2575fc" onEdit={() => edit('googleMapsViews', 'Via Google Maps')} />
                </div>
              </div>

              {/* ── Avaliações e Reputação ── */}
              <div className="glass rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" /> Avaliações e Reputação
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricCard label="Total de Avaliações" value={str('totalReviews')} icon={Star} color="#F5A314" onEdit={() => edit('totalReviews', 'Total de Avaliações')} />
                  <MetricCard label="Média de Estrelas" value={`${str('averageStars')} ⭐`} icon={Star} color="#F5A314" onEdit={() => edit('averageStars', 'Média de Estrelas')} />
                  <MetricCard label="Novas Avaliações" value={str('newReviewsThisMonth')} icon={TrendingUp} color="#10b981" onEdit={() => edit('newReviewsThisMonth', 'Novas Avaliações')} />
                  <MetricCard label="Sem Comentários" value={str('reviewsWithoutComments')} icon={MessageSquare} color="#64748b" onEdit={() => edit('reviewsWithoutComments', 'Sem Comentários')} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <MetricCard label="Likes Positivos" value={str('likesPositiveReviews')} icon={Star} color="#10b981" onEdit={() => edit('likesPositiveReviews', 'Likes Positivos')} />
                  <MetricCard label="Likes Negativos" value={str('likesNegativeReviews')} icon={Star} color="#ef4444" onEdit={() => edit('likesNegativeReviews', 'Likes Negativos')} />
                </div>
              </div>

              {/* ── Posicionamento ── */}
              <div className="glass rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: '#6a11cb' }} /> Posicionamento e Competitividade
                </h2>
                <p className="text-xs text-slate-500 mb-4">Análise de palavras-chave e concorrência</p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <MetricCard label="Posição Média" value={`#${avgPosition.toFixed(1)}`} icon={TrendingUp} color="#6a11cb" />
                  <MetricCard label="Total de Buscas" value={totalSearches.toLocaleString('pt-BR')} icon={Search} color="#8b5cf6" />
                  <MetricCard label="Keywords Monitoradas" value={validKeywords.length} icon={Search} color="#2575fc" />
                </div>

                <div className="bg-[#0f0b1e] rounded-xl overflow-hidden border border-[#1e1635]">
                  <div className="px-4 py-3 border-b border-[#1e1635] flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Palavras-chave Principais</p>
                    <span className="text-[10px] text-slate-600">{validKeywords.length} monitoradas</span>
                  </div>
                  {validKeywords.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">Nenhuma palavra-chave registrada neste mês.</p>
                  ) : (
                    <div className="divide-y divide-[#1e1635]/60">
                      {validKeywords.map((k, i) => (
                        <div key={i} className="px-4 py-3 flex items-center gap-3">
                          <span className="text-xs font-bold w-8" style={{ color: '#6a11cb' }}>#{k.position}</span>
                          <span className="text-xs text-white flex-1">{k.keyword}</span>
                          <p className="text-xs text-slate-300">{k.searches} concorrentes</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Citações e Backlinks ── */}
              <div className="glass rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4" style={{ color: '#6a11cb' }} /> Citações e Postagens
                </h2>
                <p className="text-xs text-slate-500 mb-4">Métricas de citações e conteúdo publicado</p>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Citações" value={str('totalCitations')} icon={FileText} color="#6a11cb" onEdit={() => edit('totalCitations', 'Total de Citações')} />
                  <MetricCard label="Simulações de Rota" value={str('routeSimulations')} icon={Navigation} color="#8b5cf6" onEdit={() => edit('routeSimulations', 'Simulações de Rota')} />
                  <MetricCard label="Postagens no Mês" value={str('postsThisMonth')} icon={FileText} color="#10b981" onEdit={() => edit('postsThisMonth', 'Postagens no Mês')} />
                </div>
              </div>

              {current?.observations && (
                <div className="glass rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-2">Considerações</h2>
                  <p className="text-xs text-slate-400 whitespace-pre-line">{current.observations}</p>
                </div>
              )}
            </>
          )}

        </main>
      </div>
    </>
  )
}
