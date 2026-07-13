'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, FileArchive, FileCode, AlertTriangle } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useAuthStore } from '@/lib/store/auth'
import { buildPreviewDocument, listHtmlPages } from '@/lib/site-generator/preview'
import type { SiteFile } from '@/lib/site-generator/types'
import SiteChatPanel, { type SiteMessage } from '@/components/content-studio/SiteChatPanel'

interface SiteProjectDoc {
  id: string
  title: string
  status: 'draft' | 'generating' | 'ready' | 'error'
  errorMessage: string | null
  files: SiteFile[] | null
  messages: SiteMessage[]
}

export default function SiteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuthStore()
  const router = useRouter()
  const [project, setProject] = useState<SiteProjectDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentPage, setCurrentPage] = useState<string | undefined>(undefined)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    if (!token || !id) return
    const res = await fetch(`/api/site-generator/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { setLoading(false); return }
    const data: SiteProjectDoc = await res.json()
    setProject(data)
    setLoading(false)
    return data
  }, [token, id])

  useEffect(() => { load() }, [load])

  // Se reabrir um projeto que ainda está gerando (ex: outra aba iniciou), continua checando.
  useEffect(() => {
    if (project?.status !== 'generating') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(load, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [project?.status, load])

  async function handleSendMessage(message: string) {
    if (!project) return
    setSending(true)
    try {
      const res = await fetch(`/api/site-generator/${project.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao aplicar alteração')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao aplicar alteração')
    } finally {
      setSending(false)
    }
  }

  async function handleExportZip() {
    if (!project?.files) return
    const zip = new JSZip()
    const mediaUrlRegex = /https?:\/\/[^"')\s]+\/api\/media\/[a-zA-Z0-9]+/g

    for (const file of project.files) {
      let content = file.content
      const urls = [...new Set(content.match(mediaUrlRegex) ?? [])]
      for (const url of urls) {
        try {
          const res = await fetch(url)
          const blob = await res.blob()
          const id = url.split('/').pop()
          const ext = blob.type.split('/')[1]?.split('+')[0] || 'jpg'
          const localPath = `images/${id}.${ext}`
          zip.file(localPath, blob)
          content = content.split(url).join(localPath)
        } catch { /* imagem não pôde ser buscada — mantém a URL absoluta original */ }
      }
      zip.file(file.path, content)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${project.title}.zip`)
  }

  function handleExportHtml() {
    if (!project?.files) return
    const html = buildPreviewDocument(project.files, currentPage)
    const blob = new Blob([html], { type: 'text/html' })
    saveAs(blob, `${project.title}.html`)
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#8b5cf6' }} />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-500 text-sm">
        Projeto não encontrado.
      </div>
    )
  }

  const pages = project.files ? listHtmlPages(project.files) : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toaster position="top-right" />
      <header className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: '#1e1635', background: '#0a0818' }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/content-studio')} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold text-white truncate">{project.title}</h1>
          {pages.length > 1 && (
            <select
              value={currentPage ?? pages[0]}
              onChange={e => setCurrentPage(e.target.value)}
              className="px-2 py-1 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none flex-shrink-0"
            >
              {pages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleExportHtml}
            disabled={!project.files?.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border transition-colors hover:text-white disabled:opacity-40"
            style={{ borderColor: '#2d2550' }}
          >
            <FileCode className="w-3.5 h-3.5" /> HTML
          </button>
          <button
            onClick={handleExportZip}
            disabled={!project.files?.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
          >
            <FileArchive className="w-3.5 h-3.5" /> Baixar ZIP
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[360px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: '#1e1635', background: '#0a0818' }}>
          <SiteChatPanel messages={project.messages} onSend={handleSendMessage} sending={sending} />
        </div>

        <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ background: '#1e1e2e' }}>
          {project.status === 'generating' && !project.files?.length ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#8b5cf6' }} />
              <p className="text-sm">Gerando site com IA...</p>
            </div>
          ) : project.status === 'error' && !project.files?.length ? (
            <div className="flex flex-col items-center gap-2 text-center max-w-sm px-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <p className="text-sm text-white">Erro ao gerar o site</p>
              <p className="text-xs text-slate-500">{project.errorMessage}</p>
            </div>
          ) : project.files?.length ? (
            <iframe
              key={JSON.stringify(project.files) + currentPage}
              sandbox="allow-scripts"
              srcDoc={buildPreviewDocument(project.files, currentPage)}
              referrerPolicy="no-referrer"
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <p className="text-sm text-slate-500">Nenhum arquivo gerado ainda.</p>
          )}
        </div>
      </div>
    </div>
  )
}
