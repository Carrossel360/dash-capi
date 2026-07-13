'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Loader2, Trash2, Globe, Share2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import type { Slide, CarouselFormat } from '@/lib/content-studio/types'
import CarouselCreateModal from '@/components/content-studio/CarouselCreateModal'
import SiteCreateWizard from '@/components/content-studio/SiteCreateWizard'
import LockedServiceModal from '@/components/LockedServiceModal'

interface CarouselSummary {
  id: string
  title: string
  format: CarouselFormat
  slides: Slide[]
  updatedAt: string
}

interface SiteProjectSummary {
  id: string
  title: string
  status: string
  updatedAt: string
}

type StudioItem =
  | { type: 'carousel'; id: string; title: string; updatedAt: string; carousel: CarouselSummary }
  | { type: 'site'; id: string; title: string; updatedAt: string; site: SiteProjectSummary }

export default function ContentStudioPage() {
  const { token, currentWorkspace } = useAuthStore()
  const router = useRouter()
  const [items, setItems] = useState<StudioItem[]>([])
  const [loading, setLoading] = useState(true)

  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [carouselModalOpen, setCarouselModalOpen] = useState(false)
  const [siteWizardOpen, setSiteWizardOpen] = useState(false)
  const [lockedLabel, setLockedLabel] = useState<string | null>(null)

  function load() {
    if (!token) return
    setLoading(true)
    Promise.all([
      fetch('/api/content-studio', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []),
      fetch('/api/site-generator', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []),
    ]).then(([carousels, sites]) => {
      const carouselItems: StudioItem[] = (Array.isArray(carousels) ? carousels : []).map((c: CarouselSummary) => ({
        type: 'carousel', id: c.id, title: c.title, updatedAt: c.updatedAt, carousel: c,
      }))
      const siteItems: StudioItem[] = (Array.isArray(sites) ? sites : []).map((s: SiteProjectSummary) => ({
        type: 'site', id: s.id, title: s.title, updatedAt: s.updatedAt, site: s,
      }))
      setItems([...carouselItems, ...siteItems].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
    }).finally(() => setLoading(false))
  }

  useEffect(load, [token])

  function handleOpenSiteWizard() {
    setTypeModalOpen(false)
    // Mesma regra de gate do Sidebar (isServiceLocked): agência nunca é bloqueada, e só
    // "viewer" de cliente é de fato restrito por serviço contratado.
    const isAgency = currentWorkspace?.isAgency ?? true
    const isViewer = currentWorkspace?.role === 'viewer'
    const locked = !isAgency && isViewer && !(currentWorkspace?.services?.siteGenerator ?? false)
    if (locked) {
      setLockedLabel('Gerador de Sites (IA)')
      return
    }
    setSiteWizardOpen(true)
  }

  async function handleDelete(item: StudioItem) {
    if (!confirm(`Excluir "${item.title}"?`)) return
    const url = item.type === 'carousel' ? `/api/content-studio/${item.id}` : `/api/site-generator/${item.id}`
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Excluído')
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
              Content Studio
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Crie carrosséis e sites com geração por IA</p>
          </div>
          <button
            onClick={() => setTypeModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Criar novo
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
              style={{ background: 'rgba(106,17,203,0.15)', border: '1px solid rgba(106,17,203,0.3)' }}>
              <Sparkles className="w-6 h-6" style={{ color: '#6a11cb' }} />
            </div>
            <p className="text-sm text-slate-400">Nada criado ainda</p>
            <p className="text-xs text-slate-600 mt-1">Clique em &quot;Criar novo&quot; para gerar o primeiro com IA</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(item => {
              if (item.type === 'carousel') {
                const c = item.carousel
                const cover = c.slides?.[0]
                const bg = cover?.background?.value ?? '#1e1635'
                return (
                  <div key={item.id}
                    className="group relative rounded-2xl overflow-hidden border cursor-pointer card-hover"
                    style={{ borderColor: '#1e1635', background: '#0f0b1e' }}
                    onClick={() => router.push(`/content-studio/${item.id}`)}
                  >
                    <div className="w-full flex items-center justify-center relative overflow-hidden"
                      style={{ aspectRatio: c.format === 'story' ? '9/16' : '1/1', background: bg }}
                    >
                      {cover?.elements?.find(e => e.type === 'text') && (
                        <p className="px-4 text-center text-xs font-bold" style={{ color: cover.elements.find(e => e.type === 'text')?.color ?? '#fff' }}>
                          {cover.elements.find(e => e.type === 'text')?.textContent}
                        </p>
                      )}
                      <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
                        <Share2 className="w-2.5 h-2.5" /> Carrossel
                      </span>
                      <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
                        {c.slides?.length ?? 0} slides
                      </span>
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white truncate">{item.title}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
                        className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              }

              const s = item.site
              const statusLabel: Record<string, string> = { draft: 'Rascunho', generating: 'Gerando...', ready: 'Pronto', error: 'Erro' }
              return (
                <div key={item.id}
                  className="group relative rounded-2xl overflow-hidden border cursor-pointer card-hover"
                  style={{ borderColor: '#1e1635', background: '#0f0b1e' }}
                  onClick={() => router.push(`/content-studio/sites/${item.id}`)}
                >
                  <div className="w-full flex items-center justify-center relative overflow-hidden"
                    style={{ aspectRatio: '4/3', background: 'linear-gradient(135deg, rgba(106,17,203,0.2), rgba(245,163,20,0.15))' }}
                  >
                    <Globe className="w-8 h-8" style={{ color: '#8b5cf6' }} />
                    <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
                      <Globe className="w-2.5 h-2.5" /> Site
                    </span>
                    <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
                      {statusLabel[s.status] ?? s.status}
                    </span>
                  </div>
                  <div className="p-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white truncate">{item.title}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
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

      {typeModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTypeModalOpen(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-md shadow-2xl z-10"
            style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
          >
            <h3 className="text-base font-bold text-white mb-4">O que você quer criar?</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setTypeModalOpen(false); setCarouselModalOpen(true) }}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border text-center transition-all hover:border-[#6a11cb]"
                style={{ borderColor: '#2d2550', background: '#1a1230' }}
              >
                <Share2 className="w-6 h-6" style={{ color: '#ec4899' }} />
                <span className="text-sm font-semibold text-white">Post Instagram</span>
                <span className="text-[10px] text-slate-500">Carrossel gerado com IA</span>
              </button>
              <button
                onClick={handleOpenSiteWizard}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border text-center transition-all hover:border-[#6a11cb]"
                style={{ borderColor: '#2d2550', background: '#1a1230' }}
              >
                <Globe className="w-6 h-6" style={{ color: '#8b5cf6' }} />
                <span className="text-sm font-semibold text-white">Novo Site</span>
                <span className="text-[10px] text-slate-500">Código real, gerado com IA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <CarouselCreateModal open={carouselModalOpen} onClose={() => setCarouselModalOpen(false)} />
      <SiteCreateWizard open={siteWizardOpen} onClose={() => setSiteWizardOpen(false)} />
      {lockedLabel && <LockedServiceModal label={lockedLabel} onClose={() => setLockedLabel(null)} />}
    </div>
  )
}
