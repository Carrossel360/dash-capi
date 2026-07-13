'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/auth'
import { LAYOUTS, type LayoutKey, buildSlideElements, defaultBackground } from '@/lib/content-studio/layouts'
import { FORMAT_DIMENSIONS, type Slide, type CarouselFormat } from '@/lib/content-studio/types'

// Extraído de app/(dashboard)/content-studio/page.tsx — mesma lógica, só isolada
// pra abrir espaço pro seletor de tipo de criação (Carrossel vs Site).
export default function CarouselCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuthStore()
  const router = useRouter()
  const [generating, setGenerating] = useState(false)

  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(7)
  const [format, setFormat] = useState<CarouselFormat>('square')
  const [layout, setLayout] = useState<LayoutKey | 'auto'>('auto')

  async function handleGenerate() {
    if (!topic.trim()) { toast.error('Descreva o tópico do carrossel'); return }
    setGenerating(true)
    try {
      const genRes = await fetch('/api/content-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic, slideCount }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error || 'Erro ao gerar slides')

      const { width, height } = FORMAT_DIMENSIONS[format]
      const slides: Slide[] = genData.slides.map((s: { title: string; body: string; imageSuggestion: string }) => {
        const chosenLayout: LayoutKey = layout === 'auto'
          ? LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)].key
          : layout
        return {
          id: crypto.randomUUID(),
          layout: chosenLayout,
          imageSuggestion: s.imageSuggestion,
          background: defaultBackground(chosenLayout),
          elements: buildSlideElements(chosenLayout, s.title, s.body, width, height),
        }
      })

      const createRes = await fetch('/api/content-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: topic, format, slides }),
      })
      const created = await createRes.json()
      if (!createRes.ok) throw new Error(created.error || 'Erro ao salvar carrossel')

      router.push(`/content-studio/${created.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar carrossel')
    } finally {
      setGenerating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !generating && onClose()} />
      <div className="relative rounded-2xl p-6 w-full max-w-md shadow-2xl z-10"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
      >
        <button onClick={() => !generating && onClose()}
          className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: '#F5A314' }} />
          Novo Carrossel com IA
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tópico do carrossel</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Ex: Como montar uma estratégia de conteúdo para Instagram"
              rows={3}
              className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Slides</label>
              <input
                type="number" min={3} max={10} value={slideCount}
                onChange={e => setSlideCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Formato</label>
              <select value={format} onChange={e => setFormat(e.target.value as CarouselFormat)}
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors">
                <option value="square">Feed (1:1)</option>
                <option value="story">Story (9:16)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Layout</label>
            <select value={layout} onChange={e => setLayout(e.target.value as LayoutKey | 'auto')}
              className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors">
              <option value="auto">IA decide (variado)</option>
              {LAYOUTS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Gerando com IA...' : 'Gerar Carrossel'}
        </button>
      </div>
    </div>
  )
}
