'use client'
import { useState, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Heart, MessageCircle, Share2, Eye, Users, Zap, Edit3, Check } from 'lucide-react'
import TopBar from '@/components/TopBar'
import PeriodSelector, { type Period } from '@/components/PeriodSelector'
import { useAuthStore } from '@/lib/store/auth'

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

/* ── Data ── */
const DEFAULT_IG: Record<string, number> = {
  followers: 24380, reach: 42600, impressions: 68400, engagements: 1567,
  eng_rate: 6.5, new_followers: 840,
  link_clicks: 2140, profile_visits: 4280, website_clicks: 980,
  stories_views: 18400, reels_views: 38200,
  conversations_started: 312, leads_bc: 89, profile_visits_bc: 1842,
}
const DEFAULT_FB: Record<string, number> = {
  followers: 8240, reach: 18400, impressions: 31000, engagements: 642,
  eng_rate: 3.5, new_followers: 180,
  link_clicks: 820, profile_visits: 1240, website_clicks: 480,
}

const IG_METRICS = [
  { key: 'followers', label: 'Seguidores', icon: Users, color: '#ec4899' },
  { key: 'new_followers', label: 'Novos Seguidores', icon: TrendingUp, color: '#6a11cb' },
  { key: 'reach', label: 'Alcance (4 sem)', icon: Eye, color: '#8b5cf6' },
  { key: 'impressions', label: 'Impressões (4 sem)', icon: Eye, color: '#2575fc' },
  { key: 'engagements', label: 'Engajamentos', icon: Heart, color: '#ec4899' },
  { key: 'eng_rate', label: 'Taxa de Engajamento', icon: TrendingUp, color: '#10b981', suffix: '%' },
  { key: 'link_clicks', label: 'Cliques no Link', icon: Zap, color: '#F5A314' },
  { key: 'profile_visits', label: 'Visitas ao Perfil', icon: Eye, color: '#6a11cb' },
  { key: 'website_clicks', label: 'Cliques no Site', icon: Zap, color: '#2575fc' },
  { key: 'stories_views', label: 'Visualizações Stories', icon: Eye, color: '#8b5cf6' },
  { key: 'reels_views', label: 'Visualizações Reels', icon: Eye, color: '#ec4899' },
  { key: 'conversations_started', label: 'Conversas Iniciadas', icon: MessageCircle, color: '#F5A314' },
  { key: 'leads_bc', label: 'Leads BC', icon: Users, color: '#6a11cb' },
  { key: 'profile_visits_bc', label: 'Visitas no Perfil BC', icon: Eye, color: '#8b5cf6' },
]

const FB_METRICS = [
  { key: 'followers', label: 'Seguidores / Curtidas', icon: Users, color: '#1877f2' },
  { key: 'new_followers', label: 'Novos Seguidores', icon: TrendingUp, color: '#6a11cb' },
  { key: 'reach', label: 'Alcance (4 sem)', icon: Eye, color: '#8b5cf6' },
  { key: 'impressions', label: 'Impressões (4 sem)', icon: Eye, color: '#2575fc' },
  { key: 'engagements', label: 'Engajamentos', icon: Heart, color: '#1877f2' },
  { key: 'eng_rate', label: 'Taxa de Engajamento', icon: TrendingUp, color: '#10b981', suffix: '%' },
  { key: 'link_clicks', label: 'Cliques no Link', icon: Zap, color: '#F5A314' },
  { key: 'profile_visits', label: 'Visitas ao Perfil', icon: Eye, color: '#6a11cb' },
  { key: 'website_clicks', label: 'Cliques no Site', icon: Zap, color: '#2575fc' },
]

const followerData = [
  { sem: 'Sem 1', seguidores: 22840, engajamentos: 1124 },
  { sem: 'Sem 2', seguidores: 23210, engajamentos: 1280 },
  { sem: 'Sem 3', seguidores: 23890, engajamentos: 1420 },
  { sem: 'Sem 4', seguidores: 24380, engajamentos: 1567 },
]

const contentMix = [
  { tipo: 'Reels', posts: 8, alcance: 38200, eng: 8.2 },
  { tipo: 'Carrossel', posts: 12, alcance: 24600, eng: 7.4 },
  { tipo: 'Foto', posts: 6, alcance: 9800, eng: 6.1 },
  { tipo: 'Stories', posts: 28, alcance: 18400, eng: 4.8 },
]

const topPosts = [
  { tipo: 'Reels', curtidas: 521, comentarios: 68, shares: 94, alcance: '12.400', eng: '5.5%' },
  { tipo: 'Carrossel', curtidas: 284, comentarios: 42, shares: 31, alcance: '4.800', eng: '7.5%' },
  { tipo: 'Stories', curtidas: 142, comentarios: 18, shares: 12, alcance: '2.200', eng: '7.8%' },
  { tipo: 'Foto', curtidas: 198, comentarios: 27, shares: 8, alcance: '3.100', eng: '7.5%' },
  { tipo: 'Reels', curtidas: 489, comentarios: 54, shares: 78, alcance: '10.800', eng: '5.7%' },
]

const Tt = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-semibold text-white">{p.value.toLocaleString('pt-BR')}</span></p>)}
    </div>
  )
}

export default function SocialMediaPage() {
  const { currentWorkspace } = useAuthStore()
  const wsId = currentWorkspace?.id ?? 'default'

  const [tab, setTab] = useState<'instagram' | 'facebook'>('instagram')
  const [period, setPeriod] = useState<Period>('30d')
  const [manualEdit, setManualEdit] = useState<{ key: string; label: string } | null>(null)
  const [igOverrides, setIgOverrides] = useState<Record<string, number>>({})
  const [fbOverrides, setFbOverrides] = useState<Record<string, number>>({})

  // Load per-workspace overrides from localStorage
  useEffect(() => {
    try {
      const ig = JSON.parse(localStorage.getItem(`sm-ig-${wsId}`) ?? '{}')
      const fb = JSON.parse(localStorage.getItem(`sm-fb-${wsId}`) ?? '{}')
      setIgOverrides(ig)
      setFbOverrides(fb)
    } catch { setIgOverrides({}); setFbOverrides({}) }
  }, [wsId])

  const isIG = tab === 'instagram'
  const accent = isIG ? '#ec4899' : '#6a11cb'
  const metrics = isIG ? IG_METRICS : FB_METRICS
  const defaults = isIG ? DEFAULT_IG : DEFAULT_FB
  const overrides = isIG ? igOverrides : fbOverrides

  function setOverrides(updater: (prev: Record<string, number>) => Record<string, number>) {
    if (isIG) {
      setIgOverrides(prev => {
        const next = updater(prev)
        localStorage.setItem(`sm-ig-${wsId}`, JSON.stringify(next))
        return next
      })
    } else {
      setFbOverrides(prev => {
        const next = updater(prev)
        localStorage.setItem(`sm-fb-${wsId}`, JSON.stringify(next))
        return next
      })
    }
  }

  const val = (k: string) => overrides[k] ?? defaults[k] ?? 0
  const fmt = (k: string, suffix?: string) => `${val(k).toLocaleString('pt-BR')}${suffix ?? ''}`

  return (
    <>
      {manualEdit && (
        <ManualEditModal
          metric={manualEdit.label}
          value={String(val(manualEdit.key))}
          onSave={(v) => setOverrides((p: Record<string, number>) => ({ ...p, [manualEdit.key]: parseFloat(v) || 0 }))}
          onClose={() => setManualEdit(null)}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Social Media" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Platform tabs + Period */}
          <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(['instagram', 'facebook'] as const).map(p => (
              <button key={p} onClick={() => setTab(p)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${tab === p ? 'text-white border-transparent' : 'bg-transparent text-slate-400 border-[#1e1635] hover:text-white'}`}
                style={tab === p ? {
                  background: p === 'instagram'
                    ? 'linear-gradient(135deg,#6a11cb,#ec4899)'
                    : '#6a11cb',
                  boxShadow: '0 4px 16px rgba(106,17,203,0.3)'
                } : {}}
              >
                {p === 'instagram' ? '📸 Instagram' : '👥 Facebook'}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-[#1e1635]" />
          <PeriodSelector value={period} onChange={setPeriod} />
          </div>

          {/* All metrics grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map(({ key, label, icon: Icon, color, suffix }) => (
              <div key={key} className="glass card-hover rounded-xl p-4 group relative">
                <button
                  onClick={() => setManualEdit({ key, label })}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-[#6a11cb]"
                  title="Editar manualmente"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: `${color}15` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                {overrides[key] !== undefined && (
                  <span className="text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded mb-1 inline-block">manual</span>
                )}
                <p className="text-xl font-bold text-white">{fmt(key, suffix)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="glass rounded-xl p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-white mb-4">Crescimento — 4 semanas</h3>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={followerData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gsm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accent} stopOpacity={0.3} /><stop offset="95%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                  <XAxis dataKey="sem" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tt />} />
                  <Area type="monotone" dataKey="seguidores" name="Seguidores" stroke={accent} strokeWidth={2} fill="url(#gsm)" />
                  <Area type="monotone" dataKey="engajamentos" name="Engajamentos" stroke="#6a11cb" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Mix de Conteúdo</h3>
              <div className="space-y-3">
                {contentMix.map((c) => (
                  <div key={c.tipo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300">{c.tipo}</span>
                      <span className="text-xs text-slate-500">{c.posts} posts · {c.eng}% eng</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#1e1635] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.alcance / 40000) * 100}%`, background: 'linear-gradient(90deg, #6a11cb, #8b5cf6)' }} />
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">{c.alcance.toLocaleString('pt-BR')} alcance</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Posts */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1635]">
              <h3 className="text-sm font-semibold text-white">Top Posts</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1635]">
                    {['Tipo', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Alcance', 'Eng. Rate'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((p, i) => (
                    <tr key={i} className="border-b border-[#1e1635]/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ color: accent, background: `${accent}15` }}>{p.tipo}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300"><span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" />{p.curtidas}</span></td>
                      <td className="px-4 py-3 text-slate-300"><span className="flex items-center gap-1"><MessageCircle className="w-3 h-3 text-blue-400" />{p.comentarios}</span></td>
                      <td className="px-4 py-3 text-slate-300"><span className="flex items-center gap-1"><Share2 className="w-3 h-3 text-purple-400" />{p.shares}</span></td>
                      <td className="px-4 py-3 text-slate-300"><span className="flex items-center gap-1"><Eye className="w-3 h-3 text-slate-500" />{p.alcance}</span></td>
                      <td className="px-4 py-3 font-bold text-emerald-400">{p.eng}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </>
  )
}
