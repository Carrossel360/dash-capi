'use client'
import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  TrendingUp, Heart, MessageCircle, Share2, Eye, Users, Zap, Edit3, Check, X,
  Loader2, PlayCircle, ExternalLink, Image as ImageIcon, Bookmark, Reply,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import PeriodSelector, { type Period } from '@/components/PeriodSelector'
import { useAuthStore } from '@/lib/store/auth'

type ApiKpis = Record<string, number | null>
type ChartRow = { dia: string; views: number; interactions: number; reach: number }
type InstagramPost = {
  id: string; mediaType: string; mediaProductType: string; timestamp: string
  caption: string | null; thumbnailUrl: string | null; mediaUrl: string | null; permalink: string | null
  views: number; reach: number; likes: number; comments: number; shares: number; saved: number
  totalInteractions: number; avgWatchTimeMs: number | null
}

const kpiDefs = [
  { key: 'views',             label: 'Visualizações',             icon: Eye,           color: '#ec4899' },
  { key: 'reach',             label: 'Contas Alcançadas',         icon: Users,         color: '#8b5cf6' },
  { key: 'followersTotal',    label: 'Seguidores (total)',        icon: Users,         color: '#6a11cb' },
  { key: 'followersNet',      label: 'Seguidores Líquidos',       icon: TrendingUp,    color: '#10b981' },
  { key: 'totalInteractions', label: 'Interações',                icon: Heart,         color: '#ec4899' },
  { key: 'accountsEngaged',   label: 'Contas com Engajamento',    icon: Zap,           color: '#F5A314' },
  { key: 'profileVisits',     label: 'Visitas ao Perfil',         icon: Eye,           color: '#2575fc' },
  { key: 'websiteClicks',     label: 'Toques no Link da Bio',     icon: Zap,           color: '#F5A314' },
]

const contentTypeLabel: Record<string, string> = { Post: 'Posts', Story: 'Stories', Reel: 'Reels', Carousel: 'Carrossel' }
const contentTypeKeys = ['Post', 'Story', 'Reel', 'Carousel']

const interactionDefs = [
  { key: 'likes',    label: 'Curtidas',        icon: Heart,        color: '#ef4444' },
  { key: 'comments', label: 'Comentários',     icon: MessageCircle, color: '#3b82f6' },
  { key: 'shares',   label: 'Compartilhamentos', icon: Share2,     color: '#8b5cf6' },
  { key: 'saves',    label: 'Salvamentos',     icon: Bookmark,     color: '#F5A314' },
  { key: 'replies',  label: 'Respostas',       icon: Reply,        color: '#10b981' },
]

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

function PostModal({ post, onClose }: { post: InstagramPost; onClose: () => void }) {
  const isVideo = post.mediaType === 'VIDEO' && !!post.mediaUrl
  const metrics = [
    { label: 'Visualizações', value: post.views.toLocaleString('pt-BR') },
    { label: 'Alcance', value: post.reach.toLocaleString('pt-BR') },
    { label: 'Curtidas', value: post.likes.toLocaleString('pt-BR') },
    { label: 'Comentários', value: post.comments.toLocaleString('pt-BR') },
    { label: 'Compartilhamentos', value: post.shares.toLocaleString('pt-BR') },
    { label: 'Salvamentos', value: post.saved.toLocaleString('pt-BR') },
    { label: 'Interações', value: post.totalInteractions.toLocaleString('pt-BR') },
    ...(post.avgWatchTimeMs != null ? [{ label: 'Tempo médio de visualização', value: `${(post.avgWatchTimeMs / 1000).toFixed(1)}s` }] : []),
  ]

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-3xl shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1635]">
          <div>
            <h3 className="text-sm font-bold text-white">{contentTypeLabel[post.mediaProductType === 'REELS' ? 'Reel' : post.mediaProductType === 'STORY' ? 'Story' : post.mediaType === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post'] ?? post.mediaProductType}</h3>
            <p className="text-[10px] text-slate-600 mt-1">{new Date(post.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-3">
            {post.permalink && (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#2d2550] text-slate-300 hover:text-white hover:border-[#6a11cb] transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir no Instagram
              </a>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ minHeight: 280 }}>
            {isVideo ? (
              <video src={post.mediaUrl!} controls className="w-full h-full object-contain" poster={post.thumbnailUrl ?? undefined} />
            ) : (post.mediaUrl || post.thumbnailUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.mediaUrl ?? post.thumbnailUrl ?? ''} alt="" className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-10 h-10 text-slate-700" />
            )}
          </div>

          <div className="space-y-4">
            {post.caption && (
              <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-6">{post.caption}</p>
            )}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Performance</p>
              <div className="grid grid-cols-2 gap-3">
                {metrics.map(m => (
                  <div key={m.label}>
                    <p className="text-sm font-bold text-white">{m.value}</p>
                    <p className="text-[10px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-semibold text-white">{p.value.toLocaleString('pt-BR')}</span></p>)}
    </div>
  )
}

export default function SocialMediaPage() {
  const { currentWorkspace, token } = useAuthStore()

  const [period, setPeriod] = useState<Period>('this_month')
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasInstagram, setHasInstagram] = useState(true)
  const [apiKpis, setApiKpis] = useState<ApiKpis>({})
  const [comparison, setComparison] = useState<Record<string, number | null>>({})
  const [chart, setChart] = useState<ChartRow[]>([])
  const [manualEdit, setManualEdit] = useState<{ key: string; label: string; value: string } | null>(null)
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({})

  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null)
  const [postSort, setPostSort] = useState<'views' | 'totalInteractions' | 'likes'>('views')
  const [backfilling, setBackfilling] = useState(false)

  function loadSocialData() {
    if (!token) return
    if (period === 'custom' && !customRange) return
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    const q = period === 'custom' && customRange
      ? `?period=custom&from=${customRange.from}&to=${customRange.to}`
      : `?period=${period}`
    return fetch(`/api/social-media${q}`, { headers })
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? `social ${r.status}`) }))
      .then(d => {
        setApiKpis(d.kpis ?? {})
        setComparison(d.comparison ?? {})
        setChart(d.chart ?? [])
        setHasInstagram(d.hasInstagram ?? true)
      })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Erro ao buscar dados de Social Media'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSocialData() }, [token, period, customRange])

  // Chave de período usada tanto pro fetch dos overrides manuais quanto pra escopar onde eles
  // se aplicam (editar "Seguidores" em Julho não deve valer também pra Agosto).
  const periodKey = period === 'custom' && customRange ? `custom:${customRange.from}:${customRange.to}` : period

  // Overrides manuais persistidos por workspace + período — recarrega (substituindo o estado
  // local por inteiro) sempre que o token/período muda, pra não vazar o valor editado de um
  // cliente pro próximo que for aberto na mesma sessão (era o bug: "muda 1 e muda em todos").
  useEffect(() => {
    if (!token) return
    if (period === 'custom' && !customRange) return
    fetch(`/api/manual-metrics?service=social_media&period=${encodeURIComponent(periodKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { overrides: {} })
      .then(d => setManualOverrides(d.overrides ?? {}))
      .catch(() => setManualOverrides({}))
  }, [token, periodKey])

  async function saveManualOverride(metricKey: string, val: number) {
    if (!token) return
    setManualOverrides(prev => ({ ...prev, [metricKey]: val })) // otimista
    try {
      const res = await fetch('/api/manual-metrics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service: 'social_media', period: periodKey, metricKey, value: val }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Erro ao salvar edição manual')
    }
  }

  async function removeManualOverride(metricKey: string) {
    if (!token) return
    setManualOverrides(p => { const n = { ...p }; delete n[metricKey]; return n }) // otimista
    try {
      const res = await fetch(`/api/manual-metrics?service=social_media&period=${encodeURIComponent(periodKey)}&metricKey=${metricKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Erro ao remover edição manual')
    }
  }

  async function handleBackfill() {
    if (!token) return
    setBackfilling(true)
    try {
      const body = period === 'custom' && customRange
        ? { period: 'custom', from: customRange.from, to: customRange.to }
        : { period }
      const res = await fetch('/api/social-media/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar histórico')
      if (data.result?.error) throw new Error(data.result.error)
      toast.success('Histórico sincronizado')
      await loadSocialData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar histórico')
    } finally {
      setBackfilling(false)
    }
  }

  useEffect(() => {
    if (!token) return
    setPostsLoading(true)
    fetch('/api/social-media/posts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? 'Erro ao buscar posts') }))
      .then(d => setPosts(d.posts ?? []))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Erro ao buscar posts'))
      .finally(() => setPostsLoading(false))
  }, [token])

  const value = (key: string) => manualOverrides[key] ?? (apiKpis[key] ?? 0)
  const sortedPosts = [...posts].sort((a, b) => b[postSort] - a[postSort])

  const viewsByType = contentTypeKeys.map(k => ({
    key: k,
    label: contentTypeLabel[k],
    value: Number(apiKpis[`views${k}`] ?? 0),
  }))
  const maxViewsByType = Math.max(1, ...viewsByType.map(v => v.value))

  const interactionsByType = contentTypeKeys.map(k => ({
    key: k,
    label: contentTypeLabel[k],
    value: Number(apiKpis[`interactions${k}`] ?? 0),
  }))
  const maxInteractionsByType = Math.max(1, ...interactionsByType.map(v => v.value))

  return (
    <>
      {manualEdit && (
        <ManualEditModal
          metric={manualEdit.label}
          value={manualEdit.value}
          onSave={(v) => saveManualOverride(manualEdit!.key, parseFloat(v) || 0)}
          onClose={() => setManualEdit(null)}
        />
      )}
      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Social Media" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Header: plataforma + período */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#6a11cb,#ec4899)', boxShadow: '0 4px 16px rgba(106,17,203,0.3)' }}>
              📸 Instagram
            </div>
            <div className="w-px h-5 bg-[#1e1635]" />
            <PeriodSelector
              value={period}
              onChange={p => { setPeriod(p); if (p !== 'custom') setCustomRange(null) }}
              onCustomChange={(from, to) => setCustomRange({ from, to })}
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-[#6a11cb] border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && !hasInstagram && (
            <div className="glass rounded-xl px-4 py-3 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20">
              Esse cliente ainda não tem uma conta do Instagram configurada. Fale com a agência pra vincular.
            </div>
          )}

          {!loading && hasInstagram && !apiKpis.hasData && (
            <div className="glass rounded-xl px-4 py-3 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 flex flex-wrap items-center justify-between gap-3">
              <span>Nenhum dado sincronizado para este período ainda. O sync automático só cobre os últimos dias — para períodos mais antigos, busque o histórico manualmente.</span>
              {period !== 'all' && (
                <button
                  onClick={handleBackfill}
                  disabled={backfilling}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60 shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
                >
                  {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {backfilling ? 'Buscando...' : 'Buscar dados históricos'}
                </button>
              )}
            </div>
          )}

          {/* Visão Geral */}
          {!loading && apiKpis.hasData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kpiDefs.map(({ key, label, icon: Icon, color }) => {
                const pct = comparison[key]
                const improved = pct != null && pct > 0
                return (
                  <div key={key} className="glass card-hover rounded-xl p-4 group relative">
                    <button onClick={() => setManualEdit({ key, label, value: value(key).toString() })}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-[#6a11cb]">
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: `${color}15` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    {manualOverrides[key] !== undefined && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">manual</span>
                        <button onClick={() => removeManualOverride(key)}
                          className="text-slate-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                      </div>
                    )}
                    <p className="text-xl font-bold text-white">{value(key).toLocaleString('pt-BR')}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-slate-500">{label}</p>
                      {pct != null && isFinite(pct) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: improved ? '#10b981' : '#ef4444' }}>
                          {improved ? '↗' : '↘'} {Math.abs(pct).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Gráfico + breakdowns por tipo de conteúdo */}
          {!loading && apiKpis.hasData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="glass rounded-xl p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold text-white mb-4">Visualizações & Interações por Dia</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chart} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gsm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} /><stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                    <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="views" name="Visualizações" stroke="#ec4899" strokeWidth={2} fill="url(#gsm)" />
                    <Area type="monotone" dataKey="interactions" name="Interações" stroke="#6a11cb" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-4">Visualizações por Tipo</h3>
                <div className="space-y-3">
                  {viewsByType.map(v => (
                    <div key={v.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-300">{v.label}</span>
                        <span className="text-xs text-slate-500">{v.value.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#1e1635] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(v.value / maxViewsByType) * 100}%`, background: 'linear-gradient(90deg, #6a11cb, #ec4899)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Interações por tipo + interações por conteúdo */}
          {!loading && apiKpis.hasData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-4">Interações por Tipo</h3>
                <div className="grid grid-cols-2 gap-3">
                  {interactionDefs.map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{Number(apiKpis[key] ?? 0).toLocaleString('pt-BR')}</p>
                        <p className="text-[10px] text-slate-500 truncate">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-4">Interações por Tipo de Conteúdo</h3>
                <div className="space-y-3">
                  {interactionsByType.map(v => (
                    <div key={v.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-300">{v.label}</span>
                        <span className="text-xs text-slate-500">{v.value.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#1e1635] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(v.value / maxInteractionsByType) * 100}%`, background: 'linear-gradient(90deg, #ec4899, #F5A314)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top Posts */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1635] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Top Posts</h3>
              <div className="flex items-center gap-2">
                {(['views', 'totalInteractions', 'likes'] as const).map(s => (
                  <button key={s} onClick={() => setPostSort(s)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={postSort === s ? { background: '#6a11cb', color: '#fff' } : { background: 'rgba(15,11,30,0.7)', color: '#94a3b8', border: '1px solid #1e1635' }}>
                    {s === 'views' ? 'Visualizações' : s === 'totalInteractions' ? 'Interações' : 'Curtidas'}
                  </button>
                ))}
              </div>
            </div>
            {postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-[#6a11cb] animate-spin" />
              </div>
            ) : sortedPosts.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                {hasInstagram ? 'Nenhum post encontrado.' : 'Configure a conta do Instagram pra ver os posts.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
                {sortedPosts.map(p => (
                  <button key={p.id} onClick={() => setSelectedPost(p)}
                    className="glass rounded-xl overflow-hidden text-left hover:border-[#6a11cb]/50 transition-all group">
                    <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden">
                      {p.thumbnailUrl || p.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnailUrl ?? p.mediaUrl ?? ''} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-700" />
                      )}
                      {p.mediaType === 'VIDEO' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <PlayCircle className="w-8 h-8 text-white/90" />
                        </div>
                      )}
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium text-white bg-black/60">
                        {p.mediaProductType === 'REELS' ? 'Reel' : p.mediaProductType === 'STORY' ? 'Story' : p.mediaType === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Post'}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{p.views.toLocaleString('pt-BR')} views</span>
                        <span className="text-emerald-400">{p.totalInteractions} interações</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </main>
      </div>
    </>
  )
}
