'use client'
import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Loader2, CalendarClock, Lightbulb, ListChecks, Save, Wand2, ChevronDown, Trash2, FileText } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

interface ReportConfig {
  frequencyDays: number
  enabled: boolean
  lastGeneratedAt: string | null
}

// Formato antigo (Social Media/GBP, e relatórios de Tráfego Pago gerados antes da mudança pras
// "duas camadas" — Insight.content não tem migração, então registros antigos ficam nesse shape
// pra sempre).
interface LegacyReport {
  summary: string
  insights: string[]
  recommendations: string[]
}

// Formato novo, só Tráfego Pago — Camada 1 (resumoExecutivo, pro cliente) + Camada 2
// (diagnosticoTecnico, markdown com tabelas, pra equipe interna).
interface TrafficReportV2 {
  resumoExecutivo: string
  diagnosticoTecnico: string
}

type ReportShape = TrafficReportV2 | LegacyReport

function isV2Report(r: ReportShape): r is TrafficReportV2 {
  return 'resumoExecutivo' in r
}

interface InsightRow {
  id: string
  period: string | null
  createdAt: string
  report: ReportShape | null
}

// Estilo mínimo pro markdown do relatório (sem plugin de typography instalado) — cor/tamanho
// combinando com o resto do card (fundo #0f0b1e, texto slate). Tabelas ficam dentro de um
// container com scroll horizontal próprio, nunca estouram o card.
const markdownComponents = {
  p: (props: React.ComponentPropsWithoutRef<'p'>) => <p className="mb-2 last:mb-0" {...props} />,
  h1: (props: React.ComponentPropsWithoutRef<'h1'>) => <h3 className="text-xs font-bold text-white mt-3 mb-1.5 first:mt-0" {...props} />,
  h2: (props: React.ComponentPropsWithoutRef<'h2'>) => <h3 className="text-xs font-bold text-white mt-3 mb-1.5 first:mt-0" {...props} />,
  h3: (props: React.ComponentPropsWithoutRef<'h3'>) => <h4 className="text-[11px] font-semibold text-slate-300 mt-2.5 mb-1 first:mt-0" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<'ul'>) => <ul className="list-disc list-inside space-y-0.5 mb-2" {...props} />,
  ol: (props: React.ComponentPropsWithoutRef<'ol'>) => <ol className="list-decimal list-inside space-y-0.5 mb-2" {...props} />,
  strong: (props: React.ComponentPropsWithoutRef<'strong'>) => <strong className="text-white font-semibold" {...props} />,
  table: (props: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto mb-3 rounded-lg border border-[#1e1635]">
      <table className="w-full text-[11px] border-collapse" {...props} />
    </div>
  ),
  thead: (props: React.ComponentPropsWithoutRef<'thead'>) => <thead className="bg-[#1a1230]" {...props} />,
  th: (props: React.ComponentPropsWithoutRef<'th'>) => <th className="text-left font-semibold text-slate-400 px-2.5 py-1.5 border-b border-[#1e1635] whitespace-nowrap" {...props} />,
  td: (props: React.ComponentPropsWithoutRef<'td'>) => <td className="px-2.5 py-1.5 border-b border-[#1e1635]/60 text-slate-300 whitespace-nowrap" {...props} />,
}

function periodDays(period: string | null): number | null {
  if (!period) return null
  const days = parseInt(period, 10)
  return isNaN(days) ? null : days
}

// "30D" — mesma abreviação usada no seletor de período do resto do dashboard.
function formatPeriodLabel(period: string | null): string {
  const days = periodDays(period)
  return days ? `${days}D` : (period ?? '')
}

// Insight.period é fixo ("30d") — o intervalo real é derivado voltando esses dias
// a partir de createdAt, já que não guardamos from/to explícitos no registro.
function formatDateRange(createdAt: string, period: string | null): string {
  const end = new Date(createdAt)
  const days = periodDays(period)
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR')
  if (!days) return fmt(end)
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return `${fmt(start)} – ${fmt(end)}`
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const SERVICE_OPTIONS = [
  { key: 'trafego_pago', label: 'Tráfego Pago', descLabel: 'Meta Ads e Google Ads' },
  { key: 'social_media', label: 'Social Media', descLabel: 'Instagram' },
  { key: 'google_business', label: 'Google Business', descLabel: 'Google Meu Negócio' },
] as const
type ServiceKey = (typeof SERVICE_OPTIONS)[number]['key']

export default function RelatoriosIAPage() {
  const { token, currentWorkspace, accessibleWorkspaces } = useAuthStore()
  const canManage = ['admin', 'manager'].includes(currentWorkspace?.role ?? '')
  // Agendamento e "Gerar agora" são operação da agência — o cliente final (sem
  // membership no workspace isAgency:true) só enxerga o histórico de relatórios.
  const isAgencyStaff = accessibleWorkspaces.some(w => w.isAgency)

  // Quais serviços esse cliente realmente contratou — usado tanto pra desabilitar a aba
  // quanto pro botão "Gerar todos habilitados".
  const enabledServices: Record<ServiceKey, boolean> = {
    trafego_pago: !!(currentWorkspace?.services?.metaAds || currentWorkspace?.services?.googleAds || currentWorkspace?.services?.trafeqoPago),
    social_media: !!currentWorkspace?.services?.socialMedia,
    google_business: !!currentWorkspace?.services?.googleBusiness,
  }

  const [selectedService, setSelectedService] = useState<ServiceKey>('trafego_pago')
  const [config, setConfig] = useState<ReportConfig | null>(null)
  const [insights, setInsights] = useState<InsightRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [monthFilter, setMonthFilter] = useState('all')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [diagnosticoOpenIds, setDiagnosticoOpenIds] = useState<Set<string>>(new Set())

  function toggleDiagnostico(id: string) {
    setDiagnosticoOpenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      fetch(`/api/reports/config?service=${selectedService}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/reports/insights?service=${selectedService}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([configData, insightsData]) => {
        setConfig(configData.config)
        setInsights(insightsData.insights ?? [])
      })
      .finally(() => setLoading(false))
  }, [token, selectedService])

  useEffect(load, [load])

  async function saveSchedule() {
    if (!config || !token) return
    setSaving(true)
    try {
      const res = await fetch('/api/reports/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service: selectedService, frequencyDays: config.frequencyDays, enabled: config.enabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      setConfig(data.config)
      toast.success('Agendamento salvo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar agendamento')
    } finally {
      setSaving(false)
    }
  }

  async function deleteInsight(id: string) {
    if (!token) return
    if (!confirm('Excluir este relatório? Essa ação não pode ser desfeita.')) return
    try {
      const res = await fetch(`/api/reports/insights/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      setInsights(prev => prev.filter(i => i.id !== id))
      toast.success('Relatório excluído')
    } catch {
      toast.error('Erro ao excluir relatório')
    }
  }

  async function generateOne(service: ServiceKey) {
    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ service }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório')
    return data.insight
  }

  async function generateNow() {
    if (!token) return
    setGenerating(true)
    try {
      const insight = await generateOne(selectedService)
      setInsights(prev => [insight, ...prev])
      toast.success('Relatório gerado com sucesso')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setGenerating(false)
    }
  }

  // Dispara uma geração por serviço habilitado — várias Insight separadas, não um relatório
  // combinado único (cada serviço tem seu próprio histórico/aba).
  async function generateAll() {
    if (!token) return
    const services = SERVICE_OPTIONS.filter(s => enabledServices[s.key]).map(s => s.key)
    if (services.length === 0) { toast.error('Nenhum serviço habilitado pra esse cliente'); return }

    setGeneratingAll(true)
    let ok = 0, fail = 0
    for (const service of services) {
      try {
        await generateOne(service)
        ok++
      } catch {
        fail++
      }
    }
    setGeneratingAll(false)
    if (fail > 0) toast.error(`${ok} gerado(s), ${fail} falhou(aram)`)
    else toast.success(`${ok} relatório(s) gerado(s) com sucesso`)
    load()
  }

  const reportedInsights = insights.filter(i => i.report)
  const availableMonths = Array.from(new Set(reportedInsights.map(i => monthKey(i.createdAt)))).sort().reverse()
  const filteredInsights = monthFilter === 'all' ? reportedInsights : reportedInsights.filter(i => monthKey(i.createdAt) === monthFilter)

  return (
    <div className="flex flex-col h-full">
      <Toaster position="top-right" />
      <TopBar title="Relatórios com IA" />
      <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#F5A314' }} />
              Relatórios com IA
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Resumo, insights e recomendações gerados automaticamente a partir dos dados do serviço selecionado.
            </p>
          </div>
          {canManage && isAgencyStaff && (
            <div className="flex items-center gap-2">
              <button
                onClick={generateAll}
                disabled={generating || generatingAll}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-[#2d2550] transition-all disabled:opacity-60"
              >
                {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Gerar todos habilitados
              </button>
              <button
                onClick={generateNow}
                disabled={generating || generatingAll || !enabledServices[selectedService]}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Gerar agora
              </button>
            </div>
          )}
        </div>

        {/* Seletor de serviço */}
        <div className="flex items-center gap-2">
          {SERVICE_OPTIONS.map(opt => (
            <button key={opt.key}
              onClick={() => setSelectedService(opt.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={selectedService === opt.key
                ? { background: 'rgba(106,17,203,0.2)', color: '#fff', border: '1px solid rgba(106,17,203,0.5)' }
                : { background: '#0f0b1e', color: '#94a3b8', border: '1px solid #1e1635' }}
            >
              {opt.label}
              {!enabledServices[opt.key] && <span className="ml-1.5 text-slate-600">· não contratado</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {config && isAgencyStaff && (
              <div className="rounded-2xl p-4" style={{ background: '#0f0b1e', border: '1px solid #1e1635' }}>
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" style={{ color: '#6a11cb' }} />
                  Agendamento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Frequência automática (dias)</label>
                    <input
                      type="number" min={1} max={90}
                      value={config.frequencyDays}
                      disabled={!canManage}
                      onChange={e => setConfig({ ...config, frequencyDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors disabled:opacity-60"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        disabled={!canManage}
                        onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                        className="accent-[#6a11cb]"
                      />
                      Geração automática ativa
                    </label>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-3">
                  Provedor de IA e prompt customizado ficam em{' '}
                  <Link href="/settings" className="text-[#F5A314] hover:underline">Configurações → Relatórios com IA</Link>.
                </p>
                {config.lastGeneratedAt && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    Último relatório gerado em {new Date(config.lastGeneratedAt).toLocaleString('pt-BR')}
                  </p>
                )}
                {canManage && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={saveSchedule}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                      style={{ background: '#6a11cb' }}
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Salvar
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Histórico de relatórios</h3>
                {availableMonths.length > 1 && (
                  <select
                    value={monthFilter}
                    onChange={e => setMonthFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
                  >
                    <option value="all">Todos os meses</option>
                    {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                )}
              </div>
              {reportedInsights.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl" style={{ background: '#0f0b1e', border: '1px solid #1e1635' }}>
                  <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(106,17,203,0.15)', border: '1px solid rgba(106,17,203,0.3)' }}>
                    <Sparkles className="w-6 h-6" style={{ color: '#6a11cb' }} />
                  </div>
                  <p className="text-sm text-slate-400">Nenhum relatório gerado ainda</p>
                  <p className="text-xs text-slate-600 mt-1">Clique em &quot;Gerar agora&quot; para criar o primeiro</p>
                </div>
              ) : filteredInsights.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">Nenhum relatório neste mês</p>
              ) : (
                filteredInsights.map(i => {
                  const isOpen = expandedIds.has(i.id)
                  return (
                    <div key={i.id} className="rounded-2xl overflow-hidden" style={{ background: '#0f0b1e', border: '1px solid #1e1635' }}>
                      <div
                        onClick={() => toggleExpanded(i.id)}
                        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {currentWorkspace?.name} · {formatPeriodLabel(i.period)} · {formatDateRange(i.createdAt, i.period)}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-0.5">Gerado em {new Date(i.createdAt).toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canManage && isAgencyStaff && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteInsight(i.id) }}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title="Excluir relatório"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          {isV2Report(i.report!) ? (
                            <div>
                              <div className="text-xs text-slate-200 leading-relaxed mb-2">
                                <ReactMarkdown components={markdownComponents}>{i.report!.resumoExecutivo}</ReactMarkdown>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); toggleDiagnostico(i.id) }}
                                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-white transition-colors mt-1"
                              >
                                <FileText className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} />
                                Diagnóstico técnico
                                <ChevronDown className={`w-3 h-3 transition-transform ${diagnosticoOpenIds.has(i.id) ? 'rotate-180' : ''}`} />
                              </button>
                              {diagnosticoOpenIds.has(i.id) && (
                                <div className="text-xs text-slate-300 leading-relaxed mt-2.5 pt-2.5 border-t border-[#1e1635]">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                    {i.report!.diagnosticoTecnico}
                                  </ReactMarkdown>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-slate-200 leading-relaxed mb-3">{i.report!.summary}</p>
                              {i.report!.insights.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                                    <Lightbulb className="w-3.5 h-3.5" style={{ color: '#F5A314' }} /> Insights
                                  </p>
                                  <ul className="space-y-1">
                                    {i.report!.insights.map((ins, idx) => (
                                      <li key={idx} className="text-xs text-slate-300 flex gap-2">
                                        <span className="text-slate-600">•</span>{ins}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {i.report!.recommendations.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                                    <ListChecks className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> Recomendações
                                  </p>
                                  <ul className="space-y-1">
                                    {i.report!.recommendations.map((rec, idx) => (
                                      <li key={idx} className="text-xs text-slate-300 flex gap-2">
                                        <span className="text-slate-600">•</span>{rec}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
