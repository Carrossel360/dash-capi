'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Sparkles, Globe, Share2, Video, Link2, Upload, Trash2, ExternalLink,
  Loader2, Plus, X, ChevronDown, FileText, Palette, Image as ImageIcon, Pencil, Building2, Clock,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import type { WorkspaceInfo } from '@/lib/store/auth'
import ComingSoonModal from '@/components/ComingSoonModal'
import CarouselCreateModal from '@/components/content-studio/CarouselCreateModal'
import SiteCreateWizard from '@/components/content-studio/SiteCreateWizard'
import type { Slide } from '@/lib/content-studio/types'
import type { SiteFile } from '@/lib/site-generator/types'
import { buildThumbnailPreviewDocument } from '@/lib/site-generator/preview'

interface ClientOption { id: string; name: string }
interface Asset { id: string; category: string; type: string; label: string; url: string; createdAt: string }
interface CarouselSummary { id: string; title: string; format: string; slides: Slide[]; updatedAt: string }
interface SiteSummary { id: string; title: string; status: string; files: SiteFile[] | null; updatedAt: string }
type RecentItem =
  | { type: 'carousel'; id: string; title: string; format: string; slides: Slide[]; updatedAt: string; clientId: string; clientName: string }
  | { type: 'site'; id: string; title: string; status: string; files: SiteFile[] | null; updatedAt: string; clientId: string; clientName: string }

const CATEGORIES = [
  { key: 'id_comunicacao', label: 'ID Comunicação', icon: FileText },
  { key: 'id_visual', label: 'ID Visual', icon: Palette },
  { key: 'referencias', label: 'Referências', icon: ImageIcon },
]

const SITE_STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', generating: 'Gerando...', ready: 'Pronto', error: 'Erro' }

// Prévia visual igual à que já existia em /content-studio — cor de fundo + texto do 1º slide
// pro carrossel, ícone de globo pro site — com editar/excluir e (quando vem da lista
// "Últimas criações", que mistura clientes) o nome do cliente embaixo.
function CarouselCard({ c, clientName, onEdit, onDelete }: {
  c: CarouselSummary; clientName?: string; onEdit: () => void; onDelete: () => void
}) {
  const cover = c.slides?.[0]
  const bg = cover?.background?.value ?? '#1e1635'
  const textEl = cover?.elements?.find(e => e.type === 'text')
  return (
    <div className="rounded-xl overflow-hidden border border-[#1e1635] bg-[#0f0b1e]">
      <div onClick={onEdit} className="w-full flex items-center justify-center relative overflow-hidden cursor-pointer"
        style={{ aspectRatio: c.format === 'story' ? '9/16' : '1/1', background: bg }}
      >
        {textEl && (
          <p className="px-3 text-center text-[11px] font-bold" style={{ color: textEl.color ?? '#fff' }}>{textEl.textContent}</p>
        )}
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white">
          <Share2 className="w-2.5 h-2.5" /> Carrossel
        </span>
        <span className="absolute bottom-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white">
          {c.slides?.length ?? 0} slides
        </span>
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-[11px] font-medium text-white truncate">{c.title}</p>
        {clientName && <p className="text-[10px] text-slate-500 truncate">{clientName}</p>}
        <div className="flex items-center gap-1 pt-0.5">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-medium text-slate-300 border border-[#2d2550] hover:text-white hover:border-[#6a11cb] transition-all">
            <Pencil className="w-2.5 h-2.5" /> Editor
          </button>
          <button onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SiteCard({ s, clientName, onEdit, onDelete }: {
  s: SiteSummary; clientName?: string; onEdit: () => void; onDelete: () => void
}) {
  const previewHtml = s.files?.length ? buildThumbnailPreviewDocument(s.files) : null
  return (
    <div className="rounded-xl overflow-hidden border border-[#1e1635] bg-[#0f0b1e]">
      <div onClick={onEdit} className="w-full relative overflow-hidden cursor-pointer"
        style={{ aspectRatio: '4/3', background: previewHtml ? '#fff' : 'linear-gradient(135deg, rgba(106,17,203,0.2), rgba(245,163,20,0.15))' }}
      >
        {previewHtml ? (
          // Recorte da parte de cima da página (seção hero) — renderiza num viewport maior
          // e encolhe, o container com overflow:hidden corta o resto. Sem scripts (só
          // visual) pra não rodar JS de vários sites ao mesmo tempo numa grade de cards.
          <div style={{ width: '400%', height: '400%', transform: 'scale(0.25)', transformOrigin: 'top left' }}>
            <iframe srcDoc={previewHtml} sandbox="allow-same-origin" scrolling="no" tabIndex={-1}
              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Globe className="w-6 h-6" style={{ color: '#8b5cf6' }} />
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white">
          <Globe className="w-2.5 h-2.5" /> Site
        </span>
        <span className="absolute bottom-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white">
          {SITE_STATUS_LABEL[s.status] ?? s.status}
        </span>
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-[11px] font-medium text-white truncate">{s.title}</p>
        {clientName && <p className="text-[10px] text-slate-500 truncate">{clientName}</p>}
        <div className="flex items-center gap-1 pt-0.5">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-medium text-slate-300 border border-[#2d2550] hover:text-white hover:border-[#6a11cb] transition-all">
            <Pencil className="w-2.5 h-2.5" /> Editor
          </button>
          <button onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CriacaoPage() {
  const { token, switchWorkspace } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const h = { Authorization: `Bearer ${token}` }

  // Restaura cliente/aba selecionados ao voltar do editor (ver openEditor + editores de
  // Estúdio de Criação, que devolvem pra cá via ?client=&view=tipos em vez de largar o admin
  // na área do cliente).
  const [view, setView] = useState<'portfolio' | 'tipos'>(() => (searchParams.get('view') === 'tipos' ? 'tipos' : 'portfolio'))
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState(() => searchParams.get('client') ?? '')
  const [category, setCategory] = useState(CATEGORIES[0].key)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [comingSoonVideo, setComingSoonVideo] = useState(false)

  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sessão "emprestada" do cliente selecionado — só usada nos bastidores pra chamar as APIs
  // de Estúdio de Criação (que hoje leem o workspace do próprio token) sem trocar o workspace
  // da sessão real: Sidebar/TopBar continuam mostrando o painel da agência o tempo todo.
  // "Abrir editor" é a única ação que faz a troca de verdade (ver openEditor).
  const [clientToken, setClientToken] = useState<string | null>(null)
  const [clientWorkspace, setClientWorkspace] = useState<WorkspaceInfo | null>(null)
  const [loadingCreations, setLoadingCreations] = useState(false)
  const [carousels, setCarousels] = useState<CarouselSummary[]>([])
  const [sites, setSites] = useState<SiteSummary[]>([])
  const [carouselModalOpen, setCarouselModalOpen] = useState(false)
  const [siteWizardOpen, setSiteWizardOpen] = useState(false)
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  // Biblioteca de "últimas criações" (todos os clientes) mostrada na tela inicial, antes de
  // escolher um cliente específico.
  useEffect(() => {
    if (clientId) return
    setLoadingRecent(true)
    fetch('/api/content-studio/recent', { headers: h })
      .then(r => r.json())
      .then(d => setRecentItems(d.items ?? []))
      .finally(() => setLoadingRecent(false))
  }, [clientId]) // eslint-disable-line

  useEffect(() => {
    fetch('/api/clients', { headers: h })
      .then(r => r.json())
      .then(d => setClients((d.clients ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
  }, [token]) // eslint-disable-line

  const loadAssets = useCallback(() => {
    if (!clientId) { setAssets([]); return }
    setLoadingAssets(true)
    fetch(`/api/portfolio?clientId=${clientId}`, { headers: h })
      .then(r => r.json())
      .then(d => setAssets(d.assets ?? []))
      .finally(() => setLoadingAssets(false))
  }, [clientId, token]) // eslint-disable-line

  useEffect(() => { loadAssets() }, [loadAssets])

  async function addLink() {
    if (!clientId) { toast.error('Selecione um cliente'); return }
    if (!linkLabel.trim() || !linkUrl.trim()) { toast.error('Preencha rótulo e link'); return }
    setAddingLink(true)
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ clientId, category, label: linkLabel, url: linkUrl }),
      })
      if (!res.ok) throw new Error()
      setLinkLabel(''); setLinkUrl(''); loadAssets()
      toast.success('Link adicionado')
    } catch { toast.error('Erro ao adicionar link') } finally { setAddingLink(false) }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!clientId) { toast.error('Selecione um cliente'); return }
    setUploadingFile(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ clientId, category, label: file.name, dataUrl }),
      })
      if (!res.ok) throw new Error()
      loadAssets()
      toast.success('Arquivo enviado')
    } catch { toast.error('Erro ao enviar arquivo') } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removeAsset(id: string) {
    setAssets(prev => prev.filter(a => a.id !== id)) // otimista
    try { await fetch(`/api/portfolio/${id}`, { method: 'DELETE', headers: h }) } catch { loadAssets() }
  }

  // Pega (e cacheia) um token de sessão do cliente selecionado, sem tocar na sessão real —
  // não chama switchWorkspace do store, então Sidebar/TopBar não mudam.
  const ensureClientToken = useCallback(async (): Promise<string | null> => {
    if (!clientId) return null
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ workspaceId: clientId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error('Erro ao acessar dados do cliente'); return null }
      setClientToken(data.token)
      setClientWorkspace(data.workspace)
      return data.token as string
    } catch { toast.error('Erro ao acessar dados do cliente'); return null }
  }, [clientId, token]) // eslint-disable-line

  const loadCreations = useCallback(async () => {
    if (!clientId) { setCarousels([]); setSites([]); return }
    setLoadingCreations(true)
    try {
      const t = await ensureClientToken()
      if (!t) return
      const hh = { Authorization: `Bearer ${t}` }
      const [c, s] = await Promise.all([
        fetch('/api/content-studio', { headers: hh }).then(r => r.json()).catch(() => []),
        fetch('/api/site-generator', { headers: hh }).then(r => r.json()).catch(() => []),
      ])
      setCarousels(Array.isArray(c) ? c : [])
      setSites(Array.isArray(s) ? s : [])
    } finally {
      setLoadingCreations(false)
    }
  }, [clientId]) // eslint-disable-line

  useEffect(() => {
    setClientToken(null); setClientWorkspace(null)
    if (view === 'tipos') loadCreations()
  }, [clientId]) // eslint-disable-line

  useEffect(() => { if (view === 'tipos' && clientId && carousels.length === 0 && sites.length === 0 && !loadingCreations) loadCreations() }, [view]) // eslint-disable-line

  async function openCreateCarousel() {
    if (!clientId) { toast.error('Selecione um cliente primeiro'); return }
    const t = clientToken ?? await ensureClientToken()
    if (!t) return
    setCarouselModalOpen(true)
  }

  async function openCreateSite() {
    if (!clientId) { toast.error('Selecione um cliente primeiro'); return }
    const t = clientToken ?? await ensureClientToken()
    if (!t) return
    setSiteWizardOpen(true)
  }

  // Pega uma sessão do cliente sem mexer na sessão real — usada pra editar/excluir itens de
  // "Últimas criações" (cliente diferente do selecionado, sem token em cache ainda).
  async function getEphemeralSession(targetClientId: string): Promise<{ token: string; workspace: WorkspaceInfo } | null> {
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ workspaceId: targetClientId }),
      })
      const data = await res.json()
      if (!res.ok) return null
      return { token: data.token as string, workspace: data.workspace as WorkspaceInfo }
    } catch { return null }
  }

  async function deleteItemFor(targetClientId: string, kind: 'carousel' | 'site', id: string) {
    const session = targetClientId === clientId && clientToken
      ? { token: clientToken }
      : await getEphemeralSession(targetClientId)
    if (!session) { toast.error('Erro ao excluir'); return }
    if (targetClientId === clientId) {
      if (kind === 'carousel') setCarousels(prev => prev.filter(c => c.id !== id))
      else setSites(prev => prev.filter(s => s.id !== id))
    }
    setRecentItems(prev => prev.filter(it => !(it.type === kind && it.id === id))) // otimista
    const url = kind === 'carousel' ? `/api/content-studio/${id}` : `/api/site-generator/${id}`
    await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } }).catch(() => {})
  }

  // Única ação que troca o workspace de verdade — edição fina (canvas do carrossel, código
  // do site) só existe na ferramenta dedicada. Tudo o resto (listar, gerar, excluir) acontece
  // sem sair daqui.
  async function openEditorFor(targetClientId: string, kind: 'carousel' | 'site', id: string) {
    const session = targetClientId === clientId && clientToken && clientWorkspace
      ? { token: clientToken, workspace: clientWorkspace }
      : await getEphemeralSession(targetClientId)
    if (!session) { toast.error('Erro ao abrir editor'); return }
    switchWorkspace(session.token, session.workspace)
    const base = kind === 'carousel' ? `/content-studio/${id}` : `/content-studio/sites/${id}`
    router.push(`${base}?fromAgency=1&client=${targetClientId}`)
  }

  const filteredAssets = assets.filter(a => a.category === category)
  const selectedClientName = clients.find(c => c.id === clientId)?.name ?? ''

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toaster position="top-right" toastOptions={{ style: { background: '#0f0b1e', color: '#e2e8f0', border: '1px solid #2d2550', borderRadius: '10px', fontSize: '13px' } }} />
      <TopBar title="Criação" />
      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#F5A314' }} />
              Estúdio de Criação
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Portfólio e criações por cliente — tudo gerenciado por aqui</p>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-[#1e1635]">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
              <Building2 className="w-3.5 h-3.5" /> Cliente:
            </span>
            <div className="relative">
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-xs font-medium bg-[#1e1635] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors min-w-[200px]"
              >
                <option value="">Selecionar cliente...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-[#0f0b1e] rounded-xl border border-[#1e1635] w-fit">
          {([['portfolio', 'Portfólio'], ['tipos', 'Tipos']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={view === key ? { background: '#6a11cb', color: '#fff' } : { color: '#94a3b8' }}
            >
              {label}
            </button>
          ))}
        </div>

        {!clientId && (
          <div className="glass rounded-2xl p-5 space-y-3">
            <p className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> Últimas criações
            </p>
            {loadingRecent ? (
              <div className="flex items-center justify-center py-8 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : recentItems.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-6">Nada criado ainda. Selecione um cliente acima pra começar.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {recentItems.map(item => item.type === 'carousel' ? (
                  <CarouselCard key={`carousel-${item.id}`} c={item} clientName={item.clientName}
                    onEdit={() => openEditorFor(item.clientId, 'carousel', item.id)}
                    onDelete={() => deleteItemFor(item.clientId, 'carousel', item.id)}
                  />
                ) : (
                  <SiteCard key={`site-${item.id}`} s={item} clientName={item.clientName}
                    onEdit={() => openEditorFor(item.clientId, 'site', item.id)}
                    onDelete={() => deleteItemFor(item.clientId, 'site', item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'portfolio' && clientId && (
          <div className="space-y-4">
            {clientId && (
              <>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map(c => (
                    <button key={c.key} onClick={() => setCategory(c.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                      style={category === c.key
                        ? { background: 'rgba(106,17,203,0.15)', borderColor: '#6a11cb', color: '#fff' }
                        : { borderColor: '#2d2550', color: '#94a3b8' }}
                    >
                      <c.icon className="w-3.5 h-3.5" /> {c.label}
                    </button>
                  ))}
                </div>

                <div className="glass rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> Material pronto (drive) — links, arquivos ou gerado com IA.
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={openCreateCarousel}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
                        <Sparkles className="w-3.5 h-3.5" />
                        Gerar com IA
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#2d2550] text-slate-300 hover:text-white hover:border-[#6a11cb] transition-all disabled:opacity-50">
                        {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Enviar arquivo
                      </button>
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Rótulo (ex: Manual de marca)"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb]" />
                    <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb]" />
                    <button onClick={addLink} disabled={addingLink}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#6a11cb] hover:opacity-90 disabled:opacity-50 flex-shrink-0">
                      {addingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Link
                    </button>
                  </div>

                  {loadingAssets ? (
                    <div className="flex items-center justify-center py-8 text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : filteredAssets.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-6">Nada em {CATEGORIES.find(c => c.key === category)?.label} ainda.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {filteredAssets.map(a => (
                        <div key={a.id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] bg-[#1a1230] border border-[#2d2550] text-slate-300">
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                            {a.label} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <button onClick={() => removeAsset(a.id)} className="text-slate-600 hover:text-red-400 ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'tipos' && clientId && (
          <div className="space-y-5">
            {clientId && (
              <>
                {/* Design (carrosséis) */}
                <div className="glass rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(236,72,153,0.15)' }}>
                        <Share2 className="w-4 h-4" style={{ color: '#ec4899' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Design — {selectedClientName}</p>
                        <p className="text-[11px] text-slate-500">Carrossel/post gerado com IA</p>
                      </div>
                    </div>
                    <button onClick={openCreateCarousel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
                      <Plus className="w-3.5 h-3.5" /> Novo Design
                    </button>
                  </div>

                  {loadingCreations ? (
                    <div className="flex items-center justify-center py-6 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /></div>
                  ) : carousels.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-4">Nenhum design criado ainda pra {selectedClientName}.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {carousels.map(c => (
                        <CarouselCard key={c.id} c={c}
                          onEdit={() => openEditorFor(clientId, 'carousel', c.id)}
                          onDelete={() => deleteItemFor(clientId, 'carousel', c.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Site */}
                <div className="glass rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                        <Globe className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Site — {selectedClientName}</p>
                        <p className="text-[11px] text-slate-500">Código real, gerado com IA</p>
                      </div>
                    </div>
                    <button onClick={openCreateSite}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
                      <Plus className="w-3.5 h-3.5" /> Novo Site
                    </button>
                  </div>

                  {loadingCreations ? (
                    <div className="flex items-center justify-center py-6 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /></div>
                  ) : sites.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-4">Nenhum site criado ainda pra {selectedClientName}.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {sites.map(s => (
                        <SiteCard key={s.id} s={s}
                          onEdit={() => openEditorFor(clientId, 'site', s.id)}
                          onDelete={() => deleteItemFor(clientId, 'site', s.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Vídeos */}
                <button onClick={() => setComingSoonVideo(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all hover:border-[#6a11cb]"
                  style={{ borderColor: '#1e1635', background: '#0f0b1e' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,117,252,0.15)' }}>
                    <Video className="w-4 h-4" style={{ color: '#2575fc' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Vídeos</p>
                    <p className="text-[11px] text-slate-500">Geração de vídeo com IA — em breve</p>
                  </div>
                </button>
              </>
            )}
          </div>
        )}

      </main>

      {comingSoonVideo && <ComingSoonModal label="Vídeos" onClose={() => setComingSoonVideo(false)} />}
      <CarouselCreateModal
        open={carouselModalOpen}
        onClose={() => setCarouselModalOpen(false)}
        overrideToken={clientToken ?? undefined}
        onCreated={() => { setCarouselModalOpen(false); toast.success('Design criado!'); loadCreations() }}
      />
      <SiteCreateWizard
        open={siteWizardOpen}
        onClose={() => setSiteWizardOpen(false)}
        overrideToken={clientToken ?? undefined}
        onCreated={() => { setSiteWizardOpen(false); toast.success('Site criado!'); loadCreations() }}
      />
    </div>
  )
}
