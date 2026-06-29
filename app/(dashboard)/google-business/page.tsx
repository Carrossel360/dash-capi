'use client'
import { useState, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  MapPin, Star, Phone, Navigation, Globe, MessageSquare, Zap,
  Eye, Search, Map, TrendingUp, FileText, Edit3, Check, X,
  ThumbsUp, ThumbsDown, Award,
} from 'lucide-react'
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

function MetricCard({ label, value, icon: Icon, color, trend, onEdit }: {
  label: string; value: string | number; icon: React.ElementType
  color: string; trend?: string; onEdit?: () => void
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
      {trend && <p className={`text-xs mt-1 ${trend.startsWith('+') ? 'text-emerald-400' : trend.startsWith('-') ? 'text-red-400' : 'text-slate-500'}`}>{trend} vs mês anterior</p>}
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

const viewsData = [
  { dia: 'Seg', total: 184, buscador: 102, maps: 82 },
  { dia: 'Ter', total: 220, buscador: 128, maps: 92 },
  { dia: 'Qua', total: 198, buscador: 112, maps: 86 },
  { dia: 'Qui', total: 245, buscador: 145, maps: 100 },
  { dia: 'Sex', total: 280, buscador: 164, maps: 116 },
  { dia: 'Sáb', total: 210, buscador: 120, maps: 90 },
  { dia: 'Dom', total: 132, buscador: 78, maps: 54 },
]

const actionsData = [
  { dia: 'Seg', ligacoes: 16, rotas: 18, site: 24, chat: 8, whatsapp: 5 },
  { dia: 'Ter', ligacoes: 22, rotas: 24, site: 31, chat: 11, whatsapp: 7 },
  { dia: 'Qua', ligacoes: 18, rotas: 19, site: 28, chat: 9, whatsapp: 6 },
  { dia: 'Qui', ligacoes: 28, rotas: 26, site: 38, chat: 14, whatsapp: 9 },
  { dia: 'Sex', ligacoes: 31, rotas: 29, site: 44, chat: 17, whatsapp: 11 },
  { dia: 'Sáb', ligacoes: 14, rotas: 16, site: 22, chat: 7, whatsapp: 4 },
  { dia: 'Dom', ligacoes: 8, rotas: 11, site: 14, chat: 4, whatsapp: 2 },
]

const keywords = [
  { rank: '#1', keyword: 'clínica estética São Paulo', impressoes: '2.840', cliques: '412' },
  { rank: '#2', keyword: 'tratamento estético perto de mim', impressoes: '1.920', cliques: '284' },
  { rank: '#1', keyword: 'botox São Paulo', impressoes: '1.640', cliques: '318' },
  { rank: '#3', keyword: 'preenchimento labial', impressoes: '980', cliques: '142' },
  { rank: '#2', keyword: 'harmonização facial', impressoes: '860', cliques: '128' },
]

const reviews = [
  { name: 'Mariana Costa', stars: 5, text: 'Atendimento excelente! Profissionais muito qualificados e ambiente super agradável. Voltarei com certeza!', time: '2 dias' },
  { name: 'Pedro Almeida', stars: 5, text: 'Realizei o procedimento de botox e fiquei muito satisfeito com o resultado. Equipe atenciosa.', time: '4 dias' },
  { name: 'Ana Luíza', stars: 4, text: 'Ótimo atendimento, ambiente limpo e organizado. Recomendo para quem busca qualidade.', time: '1 sem' },
  { name: 'Carlos Eduardo', stars: 5, text: 'Experiência incrível! O resultado do preenchimento ficou natural e exatamente como eu queria.', time: '1 sem' },
]

const starDist = [
  { stars: 5, pct: 82 }, { stars: 4, pct: 10 }, { stars: 3, pct: 4 }, { stars: 2, pct: 2 }, { stars: 1, pct: 2 },
]

const DEFAULT_VALS: Record<string, number> = {
  profile_views: 1469, interactions: 348, avg_rating: 4.9, map_position: 1.8,
  calls: 137, routes: 143, site_visits: 264, chat_messages: 70, whatsapp_clicks: 44,
  search_views: 892, maps_views: 577,
  profile_note: 4.9, total_reviews: 342, avg_stars: 4.9, new_reviews: 28, no_comments: 18, positive_likes: 312, negative_likes: 4,
  avg_position: 1.9, total_searches: 5240, keywords_count: 5,
  citations: 84, route_sims: 143,
}

export default function GoogleBusinessPage() {
  const { currentWorkspace } = useAuthStore()
  const wsId = currentWorkspace?.id ?? 'default'

  const [manualEdit, setManualEdit] = useState<{ key: string; label: string } | null>(null)
  const [overrides, setOverridesRaw] = useState<Record<string, number>>({})
  const [period, setPeriod] = useState<Period>('30d')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`gbp-${wsId}`) ?? '{}')
      setOverridesRaw(saved)
    } catch { setOverridesRaw({}) }
  }, [wsId])

  function setOverrides(updater: (prev: Record<string, number>) => Record<string, number>) {
    setOverridesRaw(prev => {
      const next = updater(prev)
      localStorage.setItem(`gbp-${wsId}`, JSON.stringify(next))
      return next
    })
  }

  const val = (k: string) => overrides[k] ?? DEFAULT_VALS[k] ?? 0
  const str = (k: string, suffix?: string) => `${val(k).toLocaleString('pt-BR')}${suffix ?? ''}`
  const edit = (key: string, label: string) => setManualEdit({ key, label })

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
        <TopBar title="Google Business Profile" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Period selector */}
          <PeriodSelector value={period} onChange={setPeriod} />

          {/* ── Visão Geral ── */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" style={{ color: '#6a11cb' }} /> Visão Geral — Google Meu Negócio
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Visualizações do Perfil" value={str('profile_views')} icon={Eye} color="#6a11cb" trend="+28% vs mês anterior" onEdit={() => edit('profile_views', 'Visualizações do Perfil')} />
              <MetricCard label="Total de Interações" value={str('interactions')} icon={TrendingUp} color="#8b5cf6" trend="+22% vs mês anterior" onEdit={() => edit('interactions', 'Total de Interações')} />
              <MetricCard label="Média de Avaliações" value={`${str('avg_rating')} ⭐`} icon={Star} color="#F5A314" trend="+0.1 vs mês anterior" onEdit={() => edit('avg_rating', 'Média de Avaliações')} />
              <MetricCard label="Posição Média no Mapa" value={`#${str('map_position')}`} icon={MapPin} color="#10b981" trend="-0.3 vs mês anterior" onEdit={() => edit('map_position', 'Posição Média no Mapa')} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
              <MetricCard label="Chamadas" value={str('calls')} icon={Phone} color="#2575fc" trend="+17%" onEdit={() => edit('calls', 'Chamadas')} />
              <MetricCard label="Solicitações de Rota" value={str('routes')} icon={Navigation} color="#8b5cf6" trend="+22%" onEdit={() => edit('routes', 'Solicitações de Rota')} />
              <MetricCard label="Visitas ao Site" value={str('site_visits')} icon={Globe} color="#10b981" trend="+31%" onEdit={() => edit('site_visits', 'Visitas ao Site')} />
              <MetricCard label="Mensagens Chat" value={str('chat_messages')} icon={MessageSquare} color="#6a11cb" trend="+18%" onEdit={() => edit('chat_messages', 'Mensagens Chat')} />
              <MetricCard label="Cliques WhatsApp" value={str('whatsapp_clicks')} icon={Zap} color="#F5A314" trend="+24%" onEdit={() => edit('whatsapp_clicks', 'Cliques WhatsApp')} />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Visualizações — 7 dias</h3>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={viewsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gvb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6a11cb" stopOpacity={0.3} /><stop offset="95%" stopColor="#6a11cb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                  <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tt />} />
                  <Area type="monotone" dataKey="buscador" name="Buscador" stroke="#6a11cb" strokeWidth={2} fill="url(#gvb)" />
                  <Area type="monotone" dataKey="maps" name="Maps" stroke="#8b5cf6" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="glass rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Ações — 7 dias</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={actionsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                  <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tt />} />
                  <Bar dataKey="ligacoes" name="Ligações" fill="#6a11cb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="rotas" name="Rotas" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="site" name="Site" fill="#2575fc" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Visualizações por origem ── */}
          <div className="glass rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4" style={{ color: '#6a11cb' }} /> Visualizações
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Visualizações do Perfil" value={str('profile_views')} icon={Eye} color="#6a11cb" trend="+28%" onEdit={() => edit('profile_views', 'Visualizações do Perfil')} />
              <MetricCard label="Via Buscador Google" value={str('search_views')} icon={Search} color="#8b5cf6" trend="+24%" onEdit={() => edit('search_views', 'Via Buscador Google')} />
              <MetricCard label="Via Google Maps" value={str('maps_views')} icon={Map} color="#2575fc" trend="+32%" onEdit={() => edit('maps_views', 'Via Google Maps')} />
            </div>
          </div>

          {/* ── Avaliações e Reputação ── */}
          <div className="glass rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" /> Avaliações e Reputação
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricCard label="Nota do Perfil" value={`${str('profile_note')} ⭐`} icon={Award} color="#F5A314" onEdit={() => edit('profile_note', 'Nota do Perfil')} />
              <MetricCard label="Total de Avaliações" value={str('total_reviews')} icon={Star} color="#F5A314" onEdit={() => edit('total_reviews', 'Total de Avaliações')} />
              <MetricCard label="Média de Estrelas" value={`${str('avg_stars')} ⭐`} icon={Star} color="#F5A314" onEdit={() => edit('avg_stars', 'Média de Estrelas')} />
              <MetricCard label="Novas Avaliações" value={str('new_reviews')} icon={TrendingUp} color="#10b981" onEdit={() => edit('new_reviews', 'Novas Avaliações')} />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <MetricCard label="Sem Comentários" value={str('no_comments')} icon={MessageSquare} color="#64748b" onEdit={() => edit('no_comments', 'Sem Comentários')} />
              <MetricCard label="Likes Positivos" value={str('positive_likes')} icon={ThumbsUp} color="#10b981" onEdit={() => edit('positive_likes', 'Likes Positivos')} />
              <MetricCard label="Likes Negativos" value={str('negative_likes')} icon={ThumbsDown} color="#ef4444" onEdit={() => edit('negative_likes', 'Likes Negativos')} />
            </div>

            {/* Stars + Recent reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-400 mb-3">Distribuição de estrelas</p>
                <div className="space-y-2">
                  {starDist.map(({ stars, pct }) => (
                    <div key={stars} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-3">{stars}</span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                      <div className="flex-1 h-2 bg-[#1e1635] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6a11cb, #8b5cf6)' }} />
                      </div>
                      <span className="text-[10px] text-slate-500 w-7 text-right">{pct}%</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#1e1635]">
                  <div className="text-center"><p className="text-lg font-bold text-emerald-400">94%</p><p className="text-[10px] text-slate-500">Respondidas</p></div>
                  <div className="text-center"><p className="text-lg font-bold" style={{ color: '#8b5cf6' }}>2.4h</p><p className="text-[10px] text-slate-500">Tempo médio resp.</p></div>
                </div>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {reviews.map((r, i) => (
                  <div key={i} className="p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>{r.name[0]}</div>
                        <span className="text-xs font-medium text-white">{r.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: r.stars }).map((_, j) => <Star key={j} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />)}
                        <span className="text-[10px] text-slate-600 ml-1">{r.time}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{r.text}</p>
                    <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Respondida</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Posicionamento e Competitividade ── */}
          <div className="glass rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: '#6a11cb' }} /> Posicionamento e Competitividade
            </h2>
            <p className="text-xs text-slate-500 mb-4">Análise de palavras-chave e concorrência</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <MetricCard label="Posição Média" value={`#${str('avg_position')}`} icon={TrendingUp} color="#6a11cb" onEdit={() => edit('avg_position', 'Posição Média')} />
              <MetricCard label="Total de Buscas" value={str('total_searches')} icon={Search} color="#8b5cf6" onEdit={() => edit('total_searches', 'Total de Buscas')} />
              <MetricCard label="Keywords Monitoradas" value={str('keywords_count')} icon={Search} color="#2575fc" onEdit={() => edit('keywords_count', 'Keywords Monitoradas')} />
            </div>

            {/* Keywords table */}
            <div className="bg-[#0f0b1e] rounded-xl overflow-hidden border border-[#1e1635]">
              <div className="px-4 py-3 border-b border-[#1e1635] flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Palavras-chave Principais</p>
                <span className="text-[10px] text-slate-600">{keywords.length} monitoradas</span>
              </div>
              <div className="divide-y divide-[#1e1635]/60">
                {keywords.map((k, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-xs font-bold w-6" style={{ color: '#6a11cb' }}>{k.rank}</span>
                    <span className="text-xs text-white flex-1">{k.keyword}</span>
                    <div className="text-right">
                      <p className="text-xs text-slate-300">{k.impressoes} impr.</p>
                      <p className="text-[10px] text-slate-500">{k.cliques} cliques</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Citações e Backlinks ── */}
          <div className="glass rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4" style={{ color: '#6a11cb' }} /> Citações e Backlinks
            </h2>
            <p className="text-xs text-slate-500 mb-4">Métricas de citações e navegação</p>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Total de Citações" value={str('citations')} icon={FileText} color="#6a11cb" onEdit={() => edit('citations', 'Total de Citações')} />
              <MetricCard label="Simulações de Rota" value={str('route_sims')} icon={Navigation} color="#8b5cf6" onEdit={() => edit('route_sims', 'Simulações de Rota')} />
            </div>
          </div>

        </main>
      </div>
    </>
  )
}
