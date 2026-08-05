'use client'
import { useState } from 'react'
import { PenLine, Loader2, X, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/auth'
import { OPENAI_TEXT_MODELS, ANTHROPIC_TEXT_MODELS, GEMINI_TEXT_MODELS } from '@/lib/ai-models'

type AiProvider = 'openai' | 'anthropic' | 'gemini'
const PROVIDER_LABELS: Record<AiProvider, string> = { openai: 'OpenAI (GPT)', anthropic: 'Anthropic (Claude)', gemini: 'Google (Gemini)' }
const PROVIDER_MODELS: Record<AiProvider, { value: string; label: string }[]> = {
  openai: OPENAI_TEXT_MODELS, anthropic: ANTHROPIC_TEXT_MODELS, gemini: GEMINI_TEXT_MODELS,
}
const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp Status', 'TikTok']

// Copy de post/criativo — texto pronto pra publicar, sem estrutura visual (diferente do
// carrossel, que monta slides). Resultado fica só na tela, com botão de copiar — não precisa
// de um model de persistência novo pra isso, é uma ferramenta de texto, não um item salvo.
export default function CopyGenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuthStore()
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [tone, setTone] = useState('')
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai')
  const [aiModel, setAiModel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ copy: string; hashtags: string[] } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    if (!topic.trim()) { toast.error('Descreva o tópico/produto'); return }
    setGenerating(true)
    setResult(null)
    try {
      const res = await fetch('/api/content-studio/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic, platform, tone: tone || undefined, aiProvider, aiModel: aiModel || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar copy')
      setResult(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar copy')
    } finally {
      setGenerating(false)
    }
  }

  function handleCopy() {
    if (!result) return
    const text = result.hashtags.length > 0
      ? `${result.copy}\n\n${result.hashtags.map(h => `#${h}`).join(' ')}`
      : result.copy
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    if (generating) return
    setTopic(''); setTone(''); setResult(null)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 theme-locked-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-md shadow-2xl z-10"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
      >
        <button onClick={handleClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <PenLine className="w-4 h-4" style={{ color: '#F5A314' }} />
          Copy para Post
        </h3>

        {!result ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tópico ou produto</label>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Ex: Promoção de sessão de laser para o Dia das Mães"
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Plataforma</label>
                  <select value={platform} onChange={e => setPlatform(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors">
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tom de voz (opcional)</label>
                  <input value={tone} onChange={e => setTone(e.target.value)} placeholder="Ex: descontraído"
                    className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Modelo de IA</label>
                  <select value={aiProvider} onChange={e => { setAiProvider(e.target.value as AiProvider); setAiModel('') }}
                    className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors">
                    {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map(p => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Versão</label>
                  <select value={aiModel} onChange={e => setAiModel(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors">
                    <option value="">Padrão</option>
                    {PROVIDER_MODELS[aiProvider].map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
              {generating ? 'Gerando com IA...' : 'Gerar Copy'}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#1a1230] border border-[#2d2550] max-h-64 overflow-y-auto">
                <p className="text-xs text-white whitespace-pre-wrap">{result.copy}</p>
                {result.hashtags.length > 0 && (
                  <p className="text-xs mt-3" style={{ color: '#8b5cf6' }}>
                    {result.hashtags.map(h => `#${h}`).join(' ')}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setResult(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-300 border border-[#2d2550] hover:text-white transition-colors">
                Gerar outra
              </button>
              <button onClick={handleCopy}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar texto'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
