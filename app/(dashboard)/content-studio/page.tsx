'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Loader2, X, Trash2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import { LAYOUTS, type LayoutKey, buildSlideElements, defaultBackground } from '@/lib/content-studio/layouts'
import { FORMAT_DIMENSIONS, type Slide, type CarouselFormat } from '@/lib/content-studio/types'

interface CarouselSummary {
  id: string
  title: string
  format: CarouselFormat
  slides: Slide[]
  updatedAt: string
}

export default function ContentStudioPage() {
  const { token } = useAuthStore()
  const router = useRouter()
  const [carousels, setCarousels] = useState<CarouselSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  // form
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(7)
  const [format, setFormat] = useState<CarouselFormat>('square')
  const [layout, setLayout] = useState<LayoutKey | 'auto'>('auto')

  function load() {
    if (!token) return
    setLoading(true)
    fetch('/api/content-studio', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setCarousels(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [token])

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

  async function handleDelete(id: string) {
    if (!confirm('Excluir este carrossel?')) return
    const res = await fetch(`/api/content-studio/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setCarousels(prev => prev.filter(c => c.id !== id))
      toast.success('Carrossel excluído')
    } else {
      toast.error('Erro ao excluir')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Toaster position="top-right" />
      <TopBar title="Content Studio" />
      <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#F5A314' }} />
              Carrosséis
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Crie carrosséis para redes sociais com geração por IA</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Carrossel
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : carousels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
              style={{ background: 'rgba(106,17,203,0.15)', border: '1px solid rgba(106,17,203,0.3)' }}>
              <Sparkles className="w-6 h-6" style={{ color: '#6a11cb' }} />
            </div>
            <p className="text-sm text-slate-400">Nenhum carrossel criado ainda</p>
            <p className="text-xs text-slate-600 mt-1">Clique em "Novo Carrossel" para gerar o primeiro com IA</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {carousels.map(c => {
              const cover = c.slides?.[0]
              const bg = cover?.background?.value ?? '#1e1635'
              return (
                <div key={c.id}
                  className="group relative rounded-2xl overflow-hidden border cursor-pointer card-hover"
                  style={{ borderColor: '#1e1635', background: '#0f0b1e' }}
                  onClick={() => router.push(`/content-studio/${c.id}`)}
                >
                  <div className="w-full flex items-center justify-center relative overflow-hidden"
                    style={{ aspectRatio: c.format === 'story' ? '9/16' : '1/1', background: bg }}
                  >
                    {cover?.elements?.find(e => e.type === 'text') && (
                      <p className="px-4 text-center text-xs font-bold" style={{ color: cover.elements.find(e => e.type === 'text')?.color ?? '#fff' }}>
                        {cover.elements.find(e => e.type === 'text')?.textContent}
                      </p>
                    )}
                    <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
                      {c.slides?.length ?? 0} slides
                    </span>
                  </div>
                  <div className="p-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white truncate">{c.title}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                      className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !generating && setModalOpen(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-md shadow-2xl z-10"
            style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
          >
            <button onClick={() => !generating && setModalOpen(false)}
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
      )}
    </div>
  )
}
