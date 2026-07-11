'use client'
import { useCallback, useEffect, useState } from 'react'
import { Sparkles, Loader2, CalendarClock, Lightbulb, ListChecks, Save, Wand2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

interface ReportConfig {
  frequencyDays: number
  enabled: boolean
  lastGeneratedAt: string | null
}

interface GeneratedReport {
  summary: string
  insights: string[]
  recommendations: string[]
}

interface InsightRow {
  id: string
  period: string | null
  createdAt: string
  report: GeneratedReport | null
}

export default function RelatoriosIAPage() {
  const { token, currentWorkspace } = useAuthStore()
  const canManage = ['admin', 'manager'].includes(currentWorkspace?.role ?? '')

  const [config, setConfig] = useState<ReportConfig | null>(null)
  const [insights, setInsights] = useState<InsightRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      fetch('/api/reports/config', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/reports/insights', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([configData, insightsData]) => {
        setConfig(configData.config)
        setInsights(insightsData.insights ?? [])
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(load, [load])

  async function saveSchedule() {
    if (!config || !token) return
    setSaving(true)
    try {
      const res = await fetch('/api/reports/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ frequencyDays: config.frequencyDays, enabled: config.enabled }),
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

  async function generateNow() {
    if (!token) return
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório')
      setInsights(prev => [data.insight, ...prev])
      toast.success('Relatório gerado com sucesso')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Toaster position="top-right" />
      <TopBar title="Relatórios com IA" />
      <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#F5A314' }} />
              Análise de Tráfego Pago com IA
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Resumo, insights e recomendações gerados automaticamente a partir dos dados de Meta Ads e Google Ads.
            </p>
          </div>
          {canManage && (
            <button
              onClick={generateNow}
              disabled={generating}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Gerar agora
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {config && (
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
              <h3 className="text-sm font-semibold text-white">Histórico de relatórios</h3>
              {insights.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl" style={{ background: '#0f0b1e', border: '1px solid #1e1635' }}>
                  <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(106,17,203,0.15)', border: '1px solid rgba(106,17,203,0.3)' }}>
                    <Sparkles className="w-6 h-6" style={{ color: '#6a11cb' }} />
                  </div>
                  <p className="text-sm text-slate-400">Nenhum relatório gerado ainda</p>
                  <p className="text-xs text-slate-600 mt-1">Clique em &quot;Gerar agora&quot; para criar o primeiro</p>
                </div>
              ) : (
                insights.filter(i => i.report).map(i => (
                  <div key={i.id} className="rounded-2xl p-4" style={{ background: '#0f0b1e', border: '1px solid #1e1635' }}>
                    <p className="text-[10px] text-slate-600 mb-2">{new Date(i.createdAt).toLocaleString('pt-BR')}</p>
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
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
