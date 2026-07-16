'use client'
import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, Zap,
  Edit3, Check, X, Eye, MessageCircle, MousePointer, Target, Lock,
  Loader2, PlayCircle, ExternalLink, Image as ImageIcon, ArrowUpDown, Film, ChevronDown, Repeat,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { RefreshCw, History } from 'lucide-react'
import TopBar from '@/components/TopBar'
import PeriodSelector, { type Period } from '@/components/PeriodSelector'
import LockedServiceModal from '@/components/LockedServiceModal'
import { useAuthStore } from '@/lib/store/auth'

const currencySymbol = (c?: string) => c === 'USD' ? 'US$' : 'R$'

/* ── KPI definitions (labels / icons / formatters — values come from API) ── */
const metaKpiDefs = [
  { key: 'spend',                           label: 'Valor Gasto',         fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, icon: DollarSign,    color: '#8b5cf6' },
  { key: 'impressions',                     label: 'Impressões',          fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: Zap,           color: '#6a11cb' },
  { key: 'reach',                           label: 'Alcance',             fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: Eye,           color: '#2575fc' },
  { key: 'frequency',                       label: 'Frequência',          fmt: (v: number) => v.toFixed(2),                                                                                  icon: Repeat,        color: '#2575fc' },
  { key: 'link_clicks',                     label: 'Cliques no Link',     fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: MousePointer,  color: '#10b981' },
  { key: 'cpc',                             label: 'CPC',                 fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,    color: '#F5A314' },
  { key: 'cpm',                             label: 'CPM',                 fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,    color: '#F5A314' },
  { key: 'ctr',                             label: 'CTR',                 fmt: (v: number) => `${v.toFixed(2)}%`,                                                                            icon: TrendingUp,    color: '#10b981' },
  { key: 'messaging_conversations_started', label: 'Conversas Iniciadas', fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: MessageCircle, color: '#ec4899' },
  { key: 'cost_per_link_click',             label: 'Custo/Clique',        fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,    color: '#F5A314' },
  { key: 'cost_per_conversation',           label: 'Custo/Conversa',      fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,    color: '#F5A314' },
  { key: 'post_engagement',                 label: 'Engajamentos',        fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: TrendingUp,    color: '#8b5cf6' },
  { key: 'results',                         label: 'Resultados',          fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: ShoppingCart,  color: '#10b981' },
  { key: 'cost_per_result',                 label: 'Custo/Resultado',     fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,    color: '#F5A314' },
  { key: 'leads_bc',                        label: 'Leads BC',            fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: Users,         color: '#6a11cb' },
  { key: 'followers',                       label: 'Seguidores',          fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: Users,         color: '#ec4899' },
  { key: 'profile_visits',                  label: 'Visitas no Perfil',   fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: TrendingUp,    color: '#8b5cf6' },
]

const googleKpiDefs = [
  { key: 'spend',                   label: 'Valor Gasto',         fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, icon: DollarSign,   color: '#ea4335' },
  { key: 'impressions',             label: 'Impressões',          fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: Zap,          color: '#6a11cb' },
  { key: 'clicks',                  label: 'Cliques',             fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: MousePointer, color: '#2575fc' },
  { key: 'ctr',                     label: 'CTR',                 fmt: (v: number) => `${v.toFixed(2)}%`,                                                                            icon: TrendingUp,   color: '#10b981' },
  { key: 'cpc',                     label: 'CPC Médio',           fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,   color: '#F5A314' },
  { key: 'conversions',             label: 'Conversões',          fmt: (v: number) => v.toLocaleString('pt-BR'),                                                                     icon: ShoppingCart, color: '#10b981' },
  { key: 'cost_per_conversion',     label: 'Custo/Conversão',     fmt: (v: number, c: string) => `${currencySymbol(c)} ${v.toFixed(2)}`,                                             icon: DollarSign,   color: '#F5A314' },
  { key: 'roas',                    label: 'ROAS',                fmt: (v: number) => `${v.toFixed(1)}x`,                                                                            icon: TrendingUp,   color: '#10b981' },
  { key: 'quality_score',           label: 'Índice de Qualidade', fmt: (v: number) => `${v}/10`,                                                                                     icon: TrendingUp,   color: '#8b5cf6' },
  { key: 'search_impression_share', label: 'Parcela Impressões',  fmt: (v: number) => `${v}%`,                                                                                       icon: TrendingUp,   color: '#6a11cb' },
]

const defaultFunnelMeta   = ['impressions', 'reach', 'link_clicks', 'messaging_conversations_started', 'leads_bc', 'results']
const defaultFunnelGoogle = ['spend', 'impressions', 'clicks', 'conversions']

type ApiKpis  = Record<string, number | null>
type ChartRow = { dia: string; leads: number; vendas: number; gasto: number }
type Campaign = { name: string; status: string; gasto: string; impressoes: string; cliques: string; ctr: string; leads: number; cpl: string; vendas: number; roas: string }
type GoogleKeyword    = { campaign: string; keyword: string; matchType: string; impressions: number; clicks: number; conversions: number; ctr: number; cost: number }
type GoogleSearchTerm = { campaign: string; term: string; status: string; impressions: number; clicks: number; conversions: number; ctr: number; cost: number }
type Creative = {
  id: string; name: string; status: string; effectiveStatus: string
  thumbnailUrl: string | null; imageUrl: string | null; videoId: string | null
  body: string | null; title: string | null
  spend: number; impressions: number; clicks: number; ctr: number; cpm: number; cpc: number
  leads: number; cpl: number
}

const statusColor: Record<string, string> = {
  Ativo: 'text-emerald-400 bg-emerald-400/10',
  Pausado: 'text-amber-400 bg-amber-400/10',
}

// Métricas de custo: uma queda é melhora (verde), uma alta é piora (vermelho) — o inverso
// das métricas de volume/performance. "spend" fica neutro (cinza): gastar mais não é bom
// nem ruim por si só, sem contexto de meta/orçamento.
const LOWER_IS_BETTER = new Set(['cpc', 'cpm', 'cost_per_result', 'cost_per_conversation', 'cost_per_link_click', 'cost_per_conversion'])
const NEUTRAL_COMPARISON = new Set(['spend'])

// "Resultados" mistura duas origens: lead real (campanha de Cadastro/Formulário) e conversa
// iniciada usada como fallback quando a campanha é de Mensagens e não gera lead. Composição
// só informativa — não some quando é só uma fonte, só ajusta o texto pra ficar claro.
function ResultsBreakdown({ fromForm, fromConversas }: { fromForm: number | null | undefined; fromConversas: number | null | undefined }) {
  const form = fromForm ?? 0
  const conv = fromConversas ?? 0
  if (form === 0 && conv === 0) return null
  const parts: string[] = []
  if (form > 0) parts.push(`${form} lead${form > 1 ? 's' : ''} formulário Meta`)
  if (conv > 0) parts.push(`${conv} conversa${conv > 1 ? 's' : ''} iniciada${conv > 1 ? 's' : ''}`)
  return <p className="text-[10px] text-slate-600 mt-0.5">{parts.join(' + ')}</p>
}

// Mesma ideia do ResultsBreakdown, só que genérico — usado pelo breakdown de conversões do
// Google Ads por categoria (chamada, formulário, agendamento...), que pode ter N itens em vez
// de só duas fontes fixas.
function MetricBreakdown({ items }: { items: { label: string; count: number }[] }) {
  if (!items.length) return null
  return <p className="text-[10px] text-slate-600 mt-0.5">{items.map(i => `${i.count} ${i.label}`).join(' + ')}</p>
}

// CTR do KPI é ponderado pelo total de impressões do período — uma campanha de alto volume
// e CTR baixo (comum em Performance Max) puxa a média geral pra baixo mesmo quando a campanha
// de Pesquisa individualmente performa muito melhor. Mostra o CTR de cada campanha à parte
// pra não parecer que o número geral "está errado".
function CtrByCampaign({ items }: { items: { name: string; ctr: string }[] }) {
  const relevant = items.filter(i => i.ctr !== '0%' && i.name.trim() !== '')
  if (relevant.length < 2) return null
  return <p className="text-[10px] text-slate-600 mt-0.5">{relevant.map(i => `${i.name}: ${i.ctr}`).join(' · ')}</p>
}

function ComparisonBadge({ metricKey, pct }: { metricKey: string; pct: number | null | undefined }) {
  if (pct === null || pct === undefined || !isFinite(pct)) return null
  const improved = LOWER_IS_BETTER.has(metricKey) ? pct < 0 : pct > 0
  const color = NEUTRAL_COMPARISON.has(metricKey) ? '#94a3b8' : improved ? '#10b981' : '#ef4444'
  const Arrow = pct >= 0 ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color }}>
      <Arrow className="w-2.5 h-2.5" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

const matchTypeLabel: Record<string, string> = { EXACT: 'Exata', PHRASE: 'Frase', BROAD: 'Ampla' }

// Lista compacta e rolável de palavras-chave/termos de pesquisa, já ordenada por impressões
// pela própria API — ranqueia naturalmente as campanhas com mais volume no topo.
function KeywordListCard({ title, loading, rows }: {
  title: string
  loading: boolean
  rows: { label: string; sub: string; tag: string | null; impressions: number; clicks: number; conversions: number }[]
}) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1635] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-slate-500">{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-[#ea4335] animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">Nenhum dado para o período selecionado.</p>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#1e1635]/50 hover:bg-white/[0.02] transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-white truncate">{r.label}</p>
                  {r.tag && <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium text-slate-400 bg-slate-400/10">{r.tag}</span>}
                </div>
                <p className="text-[10px] text-slate-600 truncate">{r.sub}</p>
              </div>
              <div className="flex items-center gap-3 text-right shrink-0">
                <div>
                  <p className="text-xs text-white">{r.impressions.toLocaleString('pt-BR')}</p>
                  <p className="text-[9px] text-slate-600">Impr.</p>
                </div>
                <div>
                  <p className="text-xs text-white">{r.clicks.toLocaleString('pt-BR')}</p>
                  <p className="text-[9px] text-slate-600">Cliques</p>
                </div>
                <div>
                  <p className={`text-xs ${r.conversions > 0 ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>{r.conversions}</p>
                  <p className="text-[9px] text-slate-600">Conv.</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      {payload.map((p) => <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-semibold text-white">{p.value}</span></p>)}
    </div>
  )
}

/* ── Manual Edit Modal ── */
function ManualEditModal({ metric, value, currency, onSave, onClose }: {
  metric: string; value: string; currency: string
  onSave: (v: string) => void; onClose: () => void
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

/* ── Creative modal ── */
function CreativeModal({ creative, adAccountId, currency, token, onClose }: {
  creative: Creative; adAccountId: string; currency: string; token: string; onClose: () => void
}) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [videoPermalink, setVideoPermalink] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [loadingVideo, setLoadingVideo] = useState(false)
  const cs = currencySymbol(currency)
  const active = creative.effectiveStatus === 'ACTIVE'

  useEffect(() => {
    if (!creative.videoId) return
    setLoadingVideo(true)
    fetch(`/api/trafego/meta/creatives/${creative.id}/video?videoId=${creative.videoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setVideoSrc(d.source ?? null)
        setVideoPermalink(d.permalinkUrl ?? null)
        if (d.source) return
        // Arquivo direto indisponível (permissão de conteúdo que o token ads_read não tem,
        // comum em vídeo/Reels publicado numa Página) — usa o preview oficial da Meta via
        // iframe (/{adId}/previews), que toca o criativo inline sem precisar do arquivo bruto.
        return fetch(`/api/trafego/meta/creatives/${creative.id}/preview`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(pd => setPreviewSrc(pd.iframeSrc ?? null))
      })
      .finally(() => setLoadingVideo(false))
  }, [creative.id, creative.videoId, token])

  const metrics = [
    { label: 'Investido',   value: `${cs} ${creative.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { label: 'Impressões',  value: creative.impressions.toLocaleString('pt-BR') },
    { label: 'Cliques',     value: creative.clicks.toLocaleString('pt-BR') },
    { label: 'CTR',         value: `${creative.ctr.toFixed(2)}%` },
    { label: 'CPM',         value: `${cs}${creative.cpm.toFixed(2)}` },
    { label: 'CPC',         value: `${cs} ${creative.cpc.toFixed(2)}` },
    { label: 'Leads Reais', value: creative.leads.toLocaleString('pt-BR') },
    { label: 'CPL',         value: creative.leads > 0 ? `${cs} ${creative.cpl.toFixed(2)}` : '-' },
  ]

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-3xl shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1635]">
          <div>
            <h3 className="text-sm font-bold text-white">{creative.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${active ? statusColor.Ativo : statusColor.Pausado}`}>
                {active ? 'Ativo' : 'Pausado'}
              </span>
              <span className="text-[10px] text-slate-600">{creative.id}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${adAccountId}&selected_ad_ids=${creative.id}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#2d2550] text-slate-300 hover:text-white hover:border-[#6a11cb] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir no Meta
            </a>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ minHeight: 280 }}>
            {creative.videoId ? (
              loadingVideo ? (
                <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
              ) : videoSrc ? (
                <video src={videoSrc} controls className="w-full h-full object-contain" poster={creative.thumbnailUrl ?? undefined} />
              ) : previewSrc ? (
                <iframe
                  src={previewSrc}
                  className="w-full h-full"
                  style={{ border: 'none' }}
                  scrolling="no"
                  allow="autoplay; encrypted-media"
                />
              ) : (
                <div className="relative w-full h-full">
                  {creative.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={creative.thumbnailUrl} alt={creative.name} className="w-full h-full object-cover opacity-50" />
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                    <PlayCircle className="w-10 h-10 text-white/80" />
                    <p className="text-xs text-slate-300">A Meta não libera o arquivo do vídeo por essa API.</p>
                    {videoPermalink && (
                      <a href={videoPermalink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                        style={{ background: '#6a11cb' }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Assistir no Facebook
                      </a>
                    )}
                  </div>
                </div>
              )
            ) : (creative.imageUrl || creative.thumbnailUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creative.imageUrl ?? creative.thumbnailUrl ?? ''} alt={creative.name} className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-10 h-10 text-slate-700" />
            )}
          </div>

          <div className="space-y-4">
            {(creative.title || creative.body) && (
              <div>
                {creative.title && <p className="text-sm font-semibold text-white mb-1">{creative.title}</p>}
                {creative.body && <p className="text-xs text-slate-400 whitespace-pre-wrap">{creative.body}</p>}
              </div>
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

/* ── Funnel icon map ── */
const FICON: Record<string, React.ElementType> = {
  reach: Eye, impressions: Zap, link_clicks: MousePointer,
  messaging_conversations_started: MessageCircle, leads_bc: Users,
  results: ShoppingCart, spend: DollarSign, ctr: TrendingUp,
  cpc: DollarSign, cpm: DollarSign, conversions: ShoppingCart,
  post_engagement: TrendingUp, followers: Users, profile_visits: Eye,
  cost_per_result: DollarSign, cost_per_conversation: DollarSign,
  cost_per_link_click: DollarSign,
  clicks: MousePointer, roas: TrendingUp, quality_score: TrendingUp,
  search_impression_share: Eye, cost_per_conversion: DollarSign,
}

/* Meta palette — purple gradient */
const FC = [
  { light: '#e9d5ff', mid: '#a855f7', dark: '#3b0764', rim: 'rgba(233,213,255,0.4)', particle: 'rgba(240,230,255,0.65)' },
  { light: '#d8b4fe', mid: '#8b5cf6', dark: '#2e1065', rim: 'rgba(216,180,254,0.35)', particle: 'rgba(221,214,254,0.58)' },
  { light: '#c4b5fd', mid: '#7c3aed', dark: '#1e0646', rim: 'rgba(196,181,253,0.32)', particle: 'rgba(196,181,253,0.52)' },
  { light: '#a78bfa', mid: '#6d28d9', dark: '#150337', rim: 'rgba(167,139,250,0.28)', particle: 'rgba(167,139,250,0.48)' },
  { light: '#8b5cf6', mid: '#5b21b6', dark: '#0d0224', rim: 'rgba(139,92,246,0.25)', particle: 'rgba(139,92,246,0.42)' },
  { light: '#fbbf24', mid: '#F5A314', dark: '#78350f', rim: 'rgba(251,191,36,0.35)', particle: 'rgba(253,230,138,0.58)' },
]

/* Google palette — near-white pink → deep crimson */
const FC_GOOGLE = [
  { light: '#ffe4e1', mid: '#ea4335', dark: '#7f1d1d', rim: 'rgba(255,228,225,0.45)', particle: 'rgba(255,228,225,0.70)' },
  { light: '#fecaca', mid: '#e03028', dark: '#6b1414', rim: 'rgba(254,202,202,0.40)', particle: 'rgba(254,202,202,0.65)' },
  { light: '#fca5a5', mid: '#d42b20', dark: '#560f0f', rim: 'rgba(252,165,165,0.36)', particle: 'rgba(252,165,165,0.60)' },
  { light: '#f87171', mid: '#c41a1a', dark: '#420909', rim: 'rgba(248,113,113,0.32)', particle: 'rgba(248,113,113,0.55)' },
  { light: '#ef4444', mid: '#991b1b', dark: '#300505', rim: 'rgba(239,68,68,0.28)',   particle: 'rgba(239,68,68,0.50)'  },
  { light: '#dc2626', mid: '#7f1d1d', dark: '#1e0303', rim: 'rgba(220,38,38,0.24)',   particle: 'rgba(220,38,38,0.45)'  },
]

const LAYER_H = 80
const LAYER_GAP = 8
const RIM_H = 24

const BARCODE: [number, number, number, number][] = [
  [0.04, 1, 18, 1.30], [0.09, 2, 10, 1.55],
  [0.13, 1, 24, 1.40], [0.18, 3, 14, 1.70],
  [0.24, 1, 10, 1.25], [0.29, 2, 20, 1.60],
  [0.36, 1, 16, 1.45], [0.42, 3, 12, 1.80],
  [0.48, 2, 22, 1.35], [0.54, 1, 14, 1.65],
  [0.60, 3, 18, 1.50], [0.66, 1, 10, 1.20],
  [0.72, 2, 24, 1.75], [0.78, 1, 16, 1.40],
  [0.84, 3, 12, 1.55], [0.90, 1, 20, 1.30],
  [0.95, 2, 14, 1.65],
]

function MatrixParticles({ color, topPct }: { color: string; topPct: number }) {
  const lo = (100 - topPct) / 2
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {BARCODE.map(([xFrac, w, h, spd], idx) => {
        const x = lo + xFrac * topPct
        return [0, 1, 2].map(pass => (
          <div key={`${idx}-${pass}`} style={{
            position: 'absolute', left: `${x}%`, top: 0,
            width: w, height: h, borderRadius: 1,
            background: color, boxShadow: `0 0 ${w + 2}px ${color}80`,
            animationName: 'matrix-fall', animationDuration: `${spd}s`,
            animationTimingFunction: 'linear', animationIterationCount: 'infinite',
            animationDelay: `${idx * 0.06 + pass * (spd / 3)}s`,
          }} />
        ))
      })}
    </div>
  )
}

type LayerColor = typeof FC[0]

// Camadas estreitas do funil não têm espaço pro rótulo completo — usa iniciais (ex: "Conversas Iniciadas" -> "CI")
function labelInitials(label: string): string {
  return label.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('').toUpperCase() || label.slice(0, 2).toUpperCase()
}

function VisualFunnel({ keys, kpiMap, currency, palette = FC }: {
  keys: string[]
  kpiMap: Record<string, { label: string; value: number; fmt: (v: number, c: string) => string }>
  currency: string
  palette?: LayerColor[]
}) {
  const steps = keys.map(k => kpiMap[k]).filter(Boolean)
  if (!steps.length) return null
  const n = steps.length
  const particleRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const TOTAL = n * 1.5
    let progress = 0, last = 0, raf: number
    function tick(ts: number) {
      const dt = last === 0 ? 0 : (ts - last) / 1000
      last = ts
      progress = (progress + dt / TOTAL * n) % n
      particleRefs.current.forEach((el, i) => {
        if (!el) return
        let dist = Math.abs(progress - i)
        if (dist > n / 2) dist = n - dist
        el.style.opacity = String(dist < 1 ? (1 + Math.cos(dist * Math.PI)) / 2 : 0)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [n])

  const topW = (i: number) => n === 1 ? 100 : Math.round(100 - i * 70 / (n - 1))
  const botW = (i: number) => i < n - 1 ? topW(i + 1) : Math.round(topW(i) * 0.64)
  const lc = palette[Math.min(n - 1, palette.length - 1)]

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
        <Target className="w-4 h-4" style={{ color: '#8b5cf6' }} />
        Funil de Conversão
      </h3>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 56%', position: 'relative', paddingTop: RIM_H / 2 }}>
          {steps.map((step, i) => {
            const c = palette[Math.min(i, palette.length - 1)]
            const Icon = FICON[step.label] ?? FICON[keys[i]] ?? Zap
            const convRate = i > 0 && steps[i - 1].value > 0 ? ((step.value / steps[i - 1].value) * 100).toFixed(1) : null
            const tW = topW(i), bW = botW(i)
            const tL = (100 - tW) / 2, bL = (100 - bW) / 2
            return (
              <div key={keys[i]} className="funnel-step" style={{ height: LAYER_H, marginTop: i === 0 ? 0 : LAYER_GAP, position: 'relative', zIndex: i + 1, animationDelay: `${i * 120}ms` }}>
                <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(${tL}% 0%, ${100 - tL}% 0%, ${100 - bL}% 100%, ${bL}% 100%)`, background: [`radial-gradient(ellipse at 35% 18%, rgba(255,255,255,0.22) 0%, transparent 44%)`, `linear-gradient(90deg, rgba(0,0,0,0.24) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.24) 100%)`, `linear-gradient(180deg, ${c.light}ee 0%, ${c.mid} 46%, ${c.dark} 100%)`].join(', '), overflow: 'hidden' }}>
                  <div ref={(el: HTMLDivElement | null) => { particleRefs.current[i] = el }} style={{ position: 'absolute', inset: 0, opacity: i === 0 ? 1 : 0 }}>
                    <MatrixParticles color={c.particle} topPct={tW} />
                  </div>
                </div>
                <div style={{ position: 'absolute', top: -(RIM_H / 2), left: `${tL}%`, width: `${tW}%`, height: RIM_H, borderRadius: '50%', background: [`radial-gradient(ellipse at 50% 32%, rgba(255,255,255,0.35) 0%, transparent 55%)`, `radial-gradient(ellipse at 50% 82%, rgba(0,0,0,0.22) 0%, transparent 55%)`, `linear-gradient(180deg, ${c.light} 0%, ${c.mid} 100%)`].join(', '), boxShadow: `0 0 16px ${c.mid}88, 0 2px 8px rgba(0,0,0,0.35)`, zIndex: 4 }} />
                <div style={{ position: 'absolute', top: 0, left: `${bL}%`, width: `${bW}%`, height: '100%', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'rgba(255,255,255,0.15)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon style={{ width: 14, height: 14, color: '#fff' }} />
                  </div>
                  {bW >= 34 && (
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: '#fff', fontWeight: 700, fontSize: 12, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {bW >= 55 ? step.label : labelInitials(step.label)}
                      </p>
                      {bW >= 55 && convRate && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 1 }}>↓ {convRate}% conv.</p>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div style={{ position: 'relative', height: 50, marginTop: 10 }}>
            {[1.0, 0.72, 0.48, 0.28].map((scale, ri) => {
              const ringW = botW(n - 1) * scale
              const ringL = (100 - ringW) / 2
              const opacity = ['bb', '66', '3a', '22'][ri]
              return (
                <div key={ri} style={{ position: 'absolute', left: `${ringL}%`, width: `${ringW}%`, top: ri * 10, height: 16, borderRadius: '50%', border: `${ri === 0 ? '1.5px' : '1px'} solid ${lc.mid}${opacity}`, boxShadow: ri === 0 ? `0 0 18px ${lc.mid}66, inset 0 0 8px ${lc.light}22` : 'none' }} />
              )
            })}
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: RIM_H / 2 }}>
          {steps.map((step, i) => {
            const c = palette[Math.min(i, palette.length - 1)]
            const convRate = i > 0 && steps[i - 1].value > 0 ? ((step.value / steps[i - 1].value) * 100).toFixed(1) : null
            return (
              <div key={keys[i]} className="funnel-step" style={{ height: LAYER_H, marginTop: i === 0 ? 0 : LAYER_GAP, display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14, animationDelay: `${i * 120 + 60}ms`, borderLeft: '1px dashed rgba(255,255,255,0.1)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: c.mid, boxShadow: `0 0 8px ${c.mid}cc` }} />
                <div>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{step.fmt(step.value, currency)}</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{step.label}</p>
                  {convRate && <p style={{ color: '#34d399', fontSize: 11, marginTop: 1 }}>→ {convRate}%</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function TrafegoPagoPage() {
  const { currentWorkspace, token } = useAuthStore()
  const currency    = currentWorkspace?.currency ?? 'BRL'
  const funnelKeys       = currentWorkspace?.funnelMetrics       ?? defaultFunnelMeta
  const googleFunnelKeys = currentWorkspace?.googleFunnelMetrics ?? defaultFunnelGoogle
  const visibleMeta = currentWorkspace?.metaVisibleMetrics   ?? []
  const visibleGoog = currentWorkspace?.googleVisibleMetrics ?? []

  // Mesma regra de bloqueio do Sidebar (components/Sidebar.tsx): só bloqueia
  // pra viewer de workspace de cliente — agência e admin/manager sempre veem tudo.
  const isAgency = currentWorkspace?.isAgency ?? true
  const isViewer = currentWorkspace?.role === 'viewer'
  const services = currentWorkspace?.services
  const metaLocked   = !isAgency && isViewer && !(services?.metaAds ?? false)
  const googleLocked = !isAgency && isViewer && !(services?.googleAds ?? false)

  const [tab, setTab] = useState<'meta' | 'google'>(() => (metaLocked && !googleLocked) ? 'google' : 'meta')
  const [lockedTab, setLockedTab] = useState<'meta' | 'google' | null>(null)
  const [period, setPeriod]   = useState<Period>('this_month')
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [syncNonce, setSyncNonce] = useState(0)
  const [animated, setAnimated] = useState(false)
  const [manualEdit, setManualEdit]       = useState<{ key: string; label: string; value: string } | null>(null)
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({})

  const [metaKpis,       setMetaKpis]       = useState<ApiKpis>({})
  const [metaChart,      setMetaChart]      = useState<ChartRow[]>([])
  const [metaCampaigns,  setMetaCampaigns]  = useState<Campaign[]>([])
  const [metaComparison, setMetaComparison] = useState<Record<string, number | null>>({})
  const [googKpis,       setGoogKpis]       = useState<ApiKpis>({})
  const [googChart,      setGoogChart]      = useState<ChartRow[]>([])
  const [googCampaigns,  setGoogCampaigns]  = useState<Campaign[]>([])
  const [googComparison, setGoogComparison] = useState<Record<string, number | null>>({})
  const [googConversionsBreakdown, setGoogConversionsBreakdown] = useState<{ label: string; count: number }[]>([])
  const [googleKeywords,     setGoogleKeywords]     = useState<GoogleKeyword[]>([])
  const [googleSearchTerms,  setGoogleSearchTerms]  = useState<GoogleSearchTerm[]>([])
  const [keywordsLoading,    setKeywordsLoading]    = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [metaHasData,   setMetaHasData]   = useState(true)
  const [googHasData,   setGoogHasData]   = useState(true)

  const [showCreatives, setShowCreatives] = useState(false)
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [creativesLoading, setCreativesLoading] = useState(false)
  const [creativeAdAccountId, setCreativeAdAccountId] = useState('')
  const [creativeStatusFilter, setCreativeStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [creativeSort, setCreativeSort] = useState<'spend' | 'ctr' | 'leads'>('spend')
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null)

  // Chave de período usada tanto pro fetch dos overrides manuais quanto pra escopar onde eles
  // se aplicam (editar "CPL" em Julho não deve valer também pra Agosto).
  const periodKey = period === 'custom' && customRange ? `custom:${customRange.from}:${customRange.to}` : period

  useEffect(() => {
    if (!token) return
    if (period === 'custom' && !customRange) return
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    const q = period === 'custom' && customRange
      ? `?period=custom&from=${customRange.from}&to=${customRange.to}`
      : `?period=${period}`
    Promise.all([
      fetch(`/api/trafego/meta${q}`,    { headers }).then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? `meta ${r.status}`) })),
      fetch(`/api/trafego/google${q}`,  { headers }).then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? `google ${r.status}`) })),
    ]).then(([meta, goog]) => {
      setMetaKpis(meta.kpis ?? {})
      setMetaChart(meta.chart ?? [])
      setMetaCampaigns(meta.campaigns ?? [])
      setMetaComparison(meta.comparison ?? {})
      setMetaHasData(meta.kpis?.hasData ?? true)
      setGoogKpis(goog.kpis ?? {})
      setGoogChart(goog.chart ?? [])
      setGoogCampaigns(goog.campaigns ?? [])
      setGoogComparison(goog.comparison ?? {})
      setGoogConversionsBreakdown(goog.conversionsBreakdown ?? [])
      setGoogHasData(goog.kpis?.hasData ?? true)
    }).finally(() => setLoading(false))
  }, [token, period, customRange, syncNonce])

  // Overrides manuais persistidos por workspace + serviço (meta_ads/google_ads) + período —
  // recarrega (e substitui o estado local por inteiro) sempre que qualquer um desses muda, pra
  // não vazar o valor editado de um cliente/aba/período pro próximo que for aberto na mesma sessão.
  useEffect(() => {
    if (!token) return
    if (period === 'custom' && !customRange) return
    const service = tab === 'meta' ? 'meta_ads' : 'google_ads'
    fetch(`/api/manual-metrics?service=${service}&period=${encodeURIComponent(periodKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { overrides: {} })
      .then(d => setManualOverrides(d.overrides ?? {}))
      .catch(() => setManualOverrides({}))
  }, [token, tab, periodKey])

  async function saveManualOverride(metricKey: string, value: number) {
    if (!token) return
    setManualOverrides(prev => ({ ...prev, [metricKey]: value })) // otimista
    try {
      const res = await fetch('/api/manual-metrics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service: tab === 'meta' ? 'meta_ads' : 'google_ads', period: periodKey, metricKey, value }),
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
      const service = tab === 'meta' ? 'meta_ads' : 'google_ads'
      const res = await fetch(`/api/manual-metrics?service=${service}&period=${encodeURIComponent(periodKey)}&metricKey=${metricKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Erro ao remover edição manual')
    }
  }

  async function handleSyncNow() {
    if (!token || syncing) return
    setSyncing(true)
    try {
      const res = await fetch('/api/trafego/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha ao sincronizar')
      toast.success('Dados de tráfego atualizados')
      setSyncNonce(n => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  async function handleBackfill() {
    if (!token || backfilling) return
    setBackfilling(true)
    try {
      const body = period === 'custom' && customRange
        ? { period: 'custom', from: customRange.from, to: customRange.to }
        : { period }
      const endpoint = tab === 'meta' ? '/api/trafego/meta/backfill' : '/api/trafego/google/backfill'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar histórico')
      if (data.result?.error) throw new Error(data.result.error)
      toast.success('Histórico sincronizado')
      setSyncNonce(n => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar histórico')
    } finally {
      setBackfilling(false)
    }
  }

  useEffect(() => {
    if (!token || !showCreatives) return
    if (period === 'custom' && !customRange) return
    setCreativesLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    const q = period === 'custom' && customRange
      ? `?period=custom&from=${customRange.from}&to=${customRange.to}`
      : `?period=${period}`
    fetch(`/api/trafego/meta/creatives${q}`, { headers })
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? 'Erro ao buscar criativos') }))
      .then(d => { setCreatives(d.creatives ?? []); setCreativeAdAccountId(d.adAccountId ?? '') })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Erro ao buscar criativos'))
      .finally(() => setCreativesLoading(false))
  }, [token, showCreatives, period, customRange])

  useEffect(() => {
    if (!token || tab !== 'google') return
    if (period === 'custom' && !customRange) return
    setKeywordsLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    const q = period === 'custom' && customRange
      ? `?period=custom&from=${customRange.from}&to=${customRange.to}`
      : `?period=${period}`
    fetch(`/api/trafego/google/keywords${q}`, { headers })
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? 'Erro ao buscar palavras-chave') }))
      .then(d => { setGoogleKeywords(d.keywords ?? []); setGoogleSearchTerms(d.searchTerms ?? []) })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Erro ao buscar palavras-chave'))
      .finally(() => setKeywordsLoading(false))
  }, [token, tab, period, customRange])

  useEffect(() => { setAnimated(false); setTimeout(() => setAnimated(true), 50) }, [tab, period])

  const isMeta      = tab === 'meta'
  const accentColor = isMeta ? '#6a11cb' : '#ea4335'
  const chart       = isMeta ? metaChart : googChart
  const campaigns   = isMeta ? metaCampaigns : googCampaigns
  const apiKpis     = isMeta ? metaKpis : googKpis
  const comparison  = isMeta ? metaComparison : googComparison
  const kpiDefs     = isMeta ? metaKpiDefs : googleKpiDefs
  const visibleKeys = isMeta
    ? (visibleMeta.length > 0 ? visibleMeta : kpiDefs.map(k => k.key))
    : (visibleGoog.length > 0 ? visibleGoog : kpiDefs.map(k => k.key))

  const displayKpis = kpiDefs
    .filter(k => visibleKeys.includes(k.key) && (apiKpis[k.key] ?? 0) !== null)
    .map(k => ({ ...k, value: manualOverrides[k.key] ?? (apiKpis[k.key] ?? 0) }))

  const kpiMap = Object.fromEntries(
    kpiDefs.map(k => [k.key, { ...k, value: manualOverrides[k.key] ?? (apiKpis[k.key] ?? 0) }])
  )
  const activeFunnel = isMeta
    ? (funnelKeys.length > 0 ? funnelKeys : defaultFunnelMeta)
    : (googleFunnelKeys.length > 0 ? googleFunnelKeys : defaultFunnelGoogle)

  const filteredCreatives = creatives
    .filter(c => creativeStatusFilter === 'all' || (creativeStatusFilter === 'active') === (c.effectiveStatus === 'ACTIVE'))
    .sort((a, b) => b[creativeSort] - a[creativeSort])

  return (
    <>
      {manualEdit && (
        <ManualEditModal
          metric={manualEdit.label}
          value={manualEdit.value}
          currency={currency}
          onSave={(v) => saveManualOverride(manualEdit!.key, parseFloat(v) || 0)}
          onClose={() => setManualEdit(null)}
        />
      )}

      {lockedTab && (
        <LockedServiceModal label={lockedTab === 'meta' ? 'Meta Ads' : 'Google Ads'} onClose={() => setLockedTab(null)} />
      )}

      {selectedCreative && (
        <CreativeModal
          creative={selectedCreative}
          adAccountId={creativeAdAccountId}
          currency={currency}
          token={token!}
          onClose={() => setSelectedCreative(null)}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Tráfego Pago" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Platform tabs + Period */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {(['meta', 'google'] as const).map((p) => {
                const locked = p === 'meta' ? metaLocked : googleLocked
                return (
                  <button key={p} onClick={() => locked ? setLockedTab(p) : setTab(p)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${tab === p && !locked ? 'text-white border-transparent' : 'bg-transparent text-slate-400 border-[#1e1635] hover:text-white'}`}
                    style={tab === p && !locked ? { background: p === 'meta' ? '#6a11cb' : '#ea4335', boxShadow: `0 4px 16px ${p === 'meta' ? 'rgba(106,17,203,0.3)' : 'rgba(234,67,53,0.3)'}` } : {}}
                  >
                    <span className="text-base font-bold">{p === 'meta' ? 'f' : 'G'}</span>
                    {p === 'meta' ? 'Meta Ads' : 'Google Ads'}
                    {locked && <Lock className="w-3 h-3 text-slate-600" />}
                  </button>
                )
              })}
            </div>
            <div className="w-px h-5 bg-[#1e1635]" />
            <PeriodSelector
              value={period}
              onChange={p => { setPeriod(p); if (p !== 'custom') setCustomRange(null) }}
              onCustomChange={(from, to) => setCustomRange({ from, to })}
            />
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#1e1635] hover:text-white hover:border-[#6a11cb] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              Atualizar agora
            </button>
            {period !== 'all' && (
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                title="Refaz a sincronização do período selecionado direto na API — útil quando a conta foi vinculada há pouco tempo e o sync automático (janela de 30 dias) não alcançou dias mais antigos."
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#1e1635] hover:text-white hover:border-[#6a11cb] transition-all disabled:opacity-50"
              >
                {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                Buscar histórico
              </button>
            )}
          </div>

          {/* Análise de Criativos (Meta) — logo abaixo das abas, antes das métricas: sessão
              própria da Meta (como um "subtítulo"), não escondida no fim da página. */}
          {isMeta && (
            <div className="glass rounded-xl overflow-hidden">
              <button onClick={() => setShowCreatives(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4" style={{ color: '#6a11cb' }} />
                  <h3 className="text-sm font-semibold text-white">Análise de Criativos</h3>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showCreatives ? 'rotate-180' : ''}`} />
              </button>

              {showCreatives && (
                <div className="border-t border-[#1e1635] p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {(['all', 'active', 'paused'] as const).map(s => (
                      <button key={s} onClick={() => setCreativeStatusFilter(s)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={creativeStatusFilter === s
                          ? { background: '#6a11cb', color: '#fff' }
                          : { background: 'rgba(15,11,30,0.7)', color: '#94a3b8', border: '1px solid #1e1635' }}
                      >
                        {s === 'all' ? 'Todos' : s === 'active' ? 'Ativos' : 'Pausados'}
                      </button>
                    ))}
                    <div className="w-px h-5 bg-[#1e1635]" />
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar:
                    </div>
                    {(['spend', 'ctr', 'leads'] as const).map(s => (
                      <button key={s} onClick={() => setCreativeSort(s)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={creativeSort === s
                          ? { background: '#6a11cb', color: '#fff' }
                          : { background: 'rgba(15,11,30,0.7)', color: '#94a3b8', border: '1px solid #1e1635' }}
                      >
                        {s === 'spend' ? 'Gasto' : s === 'ctr' ? 'CTR' : 'Leads'}
                      </button>
                    ))}
                  </div>

                  {creativesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 text-[#6a11cb] animate-spin" />
                    </div>
                  ) : filteredCreatives.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">Nenhum criativo encontrado para o período selecionado.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {filteredCreatives.map(c => {
                        const active = c.effectiveStatus === 'ACTIVE'
                        return (
                          <button key={c.id} onClick={() => setSelectedCreative(c)}
                            className="glass rounded-xl overflow-hidden text-left hover:border-[#6a11cb]/50 transition-all group"
                          >
                            <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden">
                              {c.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.thumbnailUrl} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              ) : (
                                <ImageIcon className="w-8 h-8 text-slate-700" />
                              )}
                              {c.videoId && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                  <PlayCircle className="w-8 h-8 text-white/90" />
                                </div>
                              )}
                              <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${active ? statusColor.Ativo : statusColor.Pausado}`}>
                                {active ? 'Ativo' : 'Pausado'}
                              </span>
                              <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white bg-black/60">
                                {currencySymbol(currency)} {c.spend.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2.5">
                              <p className="text-xs font-medium text-white truncate">{c.name}</p>
                              <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
                                <span>{c.impressions.toLocaleString('pt-BR')} impr.</span>
                                <span className="text-emerald-400">{c.ctr.toFixed(2)}%</span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-[#6a11cb] border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && !(isMeta ? metaHasData : googHasData) && (
            <div className="glass rounded-xl px-4 py-3 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20">
              Nenhum dado sincronizado para este período ainda. O sync automático só cobre uma janela móvel de 30 dias — para períodos mais antigos (ex: conta vinculada há pouco tempo), use o botão &quot;Buscar histórico&quot; acima.
            </div>
          )}

          {/* KPI grid */}
          {!loading && displayKpis.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {displayKpis.map(({ key, label, value, fmt, color, icon: Icon }) => (
                <div key={key} className="glass card-hover rounded-xl p-4 group relative">
                  <button onClick={() => setManualEdit({ key, label, value: value.toString() })}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-[#6a11cb]">
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                  </div>
                  {manualOverrides[key] !== undefined && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">manual</span>
                      <button onClick={() => removeManualOverride(key)}
                        className="text-slate-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  <p className="text-xl font-bold text-white">{fmt(value, currency)}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-slate-500">{label}</p>
                    <ComparisonBadge metricKey={key} pct={comparison[key]} />
                  </div>
                  {key === 'results' && isMeta && (
                    <ResultsBreakdown fromForm={apiKpis.resultsFromForm} fromConversas={apiKpis.resultsFromConversas} />
                  )}
                  {key === 'conversions' && !isMeta && (
                    <MetricBreakdown items={googConversionsBreakdown} />
                  )}
                  {key === 'ctr' && !isMeta && (
                    <CtrByCampaign items={campaigns.map(c => ({ name: c.name, ctr: c.ctr }))} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Funil + Leads por Dia lado a lado */}
          {!loading && (animated || chart.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {animated && (
                <div className="lg:col-span-2">
                  <VisualFunnel keys={activeFunnel} kpiMap={kpiMap} currency={currency} palette={isMeta ? FC : FC_GOOGLE} />
                </div>
              )}
              {chart.length > 0 && (
                <div className="glass rounded-xl p-4 lg:col-span-3">
                  <h3 className="text-sm font-semibold text-white mb-4">Leads & Resultados</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gla" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                      <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="leads" name="Resultados" stroke={accentColor} strokeWidth={2} fill="url(#gla)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Palavras-chave + Termos de Pesquisa (Google) — ao lado do gráfico de Resultados,
              não no fim da página. Cada lista rola independente pra não esticar o layout. */}
          {!loading && !isMeta && (googleKeywords.length > 0 || googleSearchTerms.length > 0 || keywordsLoading) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <KeywordListCard
                title="Palavras-chave"
                loading={keywordsLoading}
                rows={googleKeywords.map(k => ({ label: k.keyword, sub: k.campaign, tag: matchTypeLabel[k.matchType] ?? k.matchType, impressions: k.impressions, clicks: k.clicks, conversions: k.conversions }))}
              />
              <KeywordListCard
                title="Termos de Pesquisa"
                loading={keywordsLoading}
                rows={googleSearchTerms.map(t => ({ label: t.term, sub: t.campaign, tag: null, impressions: t.impressions, clicks: t.clicks, conversions: t.conversions }))}
              />
            </div>
          )}

          {/* Gasto Diário — largura total */}
          {!loading && chart.length > 0 && (
            <div className="glass rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Gasto Diário ({currencySymbol(currency)})</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                  <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="gasto" name="Gasto" fill={accentColor} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Campaigns table */}
          {!loading && campaigns.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e1635]">
                <h3 className="text-sm font-semibold text-white">Campanhas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e1635]">
                      {['Campanha', 'Status', 'Gasto', 'Impressões', 'Cliques', 'CTR', 'Resultados', 'CPR'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.name} className="border-b border-[#1e1635]/50 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{c.name}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[c.status] ?? 'text-slate-400 bg-slate-400/10'}`}>{c.status}</span></td>
                        <td className="px-4 py-3 text-slate-300">{c.gasto}</td>
                        <td className="px-4 py-3 text-slate-300">{c.impressoes}</td>
                        <td className="px-4 py-3 text-slate-300">{c.cliques}</td>
                        <td className="px-4 py-3 text-slate-300">{c.ctr}</td>
                        <td className="px-4 py-3 text-white font-medium">{c.leads}</td>
                        <td className="px-4 py-3 text-slate-300">{c.cpl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && displayKpis.length === 0 && (
            <div className="glass rounded-xl p-12 text-center">
              <p className="text-slate-500 text-sm">Nenhum dado encontrado para o período selecionado.</p>
              <p className="text-slate-600 text-xs mt-1">Tente selecionar "Todo período" ou verifique se os dados foram importados.</p>
            </div>
          )}

        </main>
      </div>
    </>
  )
}
