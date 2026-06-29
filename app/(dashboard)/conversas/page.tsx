'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search, Phone, Send, Loader2, X, Check, Tag,
  UserCheck, MessageCircle, Circle, CheckCircle2, Clock,
  ChevronDown, Trash2, Plus, Mic, Paperclip, MicOff, StopCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import { useSearchParams } from 'next/navigation'

// ── Types ────────────────────────────────────────────────────────────────────

interface ConvTag { id: string; name: string; color: string }

interface ConvSummary {
  id: string
  customerPhone: string
  customerName: string | null
  leadId: string | null
  assignedTo: string | null
  assignedName: string | null
  status: string
  lastMessageAt: string | null
  unreadCount: number
  lastMessage: { content: string; direction: string } | null
  tags: ConvTag[]
  createdAt: string
}

interface Msg {
  id: string
  content: string
  direction: 'inbound' | 'outbound'
  senderName: string | null
  sentAt: string
  reactions: { sender: string; emoji: string }[]
}

interface ConvDetail extends ConvSummary {
  messages: Msg[]
  members: { userId: string; name: string; role: string }[]
}

interface SupportTag { id: string; name: string; color: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:        '#f59e0b',
  in_progress: '#6a11cb',
  closed:      '#10b981',
}
const STATUS_LABELS: Record<string, string> = {
  open:        'Aberto',
  in_progress: 'Em andamento',
  closed:      'Fechado',
}

function initials(name: string | null, phone: string) {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return phone.slice(-2)
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function parseContent(content: string) {
  const withUrl = content.match(/^\[(audio|image|video|document|sticker|media):([\s\S]+)\]$/)
  if (withUrl) return { type: withUrl[1], url: withUrl[2] }
  const bare = content.match(/^\[(audio|áudio|image|video|document|sticker|media|mídia)\]$/i)
  if (bare) return { type: bare[1].replace('áudio','audio').replace('mídia','media'), url: '' }
  return { type: 'text', url: '' }
}

function MessageContent({ content }: { content: string }) {
  const { type, url } = parseContent(content)
  if (type === 'audio') {
    return url
      ? <audio controls src={url} className="max-w-full" style={{ height: 36 }} />
      : <span className="flex items-center gap-1.5 text-slate-400 text-xs italic"><Mic className="w-3 h-3" /> Áudio</span>
  }
  if (type === 'image') {
    return url
      ? <img src={url} alt="" className="max-w-[220px] max-h-[220px] rounded-lg object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
      : <span className="italic text-slate-400 text-xs">🖼 Imagem</span>
  }
  if (type === 'video') {
    return url
      ? <video controls src={url} className="max-w-[220px] rounded-lg" />
      : <span className="italic text-slate-400 text-xs">🎥 Vídeo</span>
  }
  if (type === 'document') {
    return url
      ? <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-400 underline text-xs"><Paperclip className="w-3 h-3" /> Documento</a>
      : <span className="italic text-slate-400 text-xs">📎 Documento</span>
  }
  if (type === 'sticker') return url ? <img src={url} alt="sticker" className="w-24" /> : null
  if (content.startsWith('[')) return <span className="italic text-slate-500 text-xs">{content}</span>
  return <span className="whitespace-pre-wrap break-words">{content}</span>
}

function previewContent(content: string): string {
  const { type } = parseContent(content)
  if (type === 'audio')    return '🎙 Áudio'
  if (type === 'image')    return '🖼 Imagem'
  if (type === 'video')    return '🎥 Vídeo'
  if (type === 'document') return '📎 Documento'
  if (type === 'sticker')  return '🎭 Sticker'
  return content.length > 60 ? content.slice(0, 60) + '…' : content
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConversasPage() {
  const { token } = useAuthStore()
  const searchParams = useSearchParams()
  const initialPhone = searchParams.get('phone')

  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [activeId, setActiveId]           = useState<string | null>(null)
  const [detail, setDetail]               = useState<ConvDetail | null>(null)
  const [tags, setTags]                   = useState<SupportTag[]>([])
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [input, setInput]                 = useState('')
  const [sending, setSending]             = useState(false)
  const [loadingList, setLoadingList]     = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showTagPanel, setShowTagPanel]   = useState(false)
  const [showAssign, setShowAssign]       = useState(false)
  const [newTagName, setNewTagName]       = useState('')
  const [noConvPhone, setNoConvPhone]     = useState<string | null>(null)
  const [startMsg, setStartMsg]           = useState('')
  const [startingSend, setStartingSend]   = useState(false)

  // Audio recording
  const [recording, setRecording]         = useState(false)
  const [recSeconds, setRecSeconds]       = useState(0)
  const mediaRecorderRef                  = useRef<MediaRecorder | null>(null)
  const audioChunksRef                    = useRef<Blob[]>([])
  const recTimerRef                       = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef                      = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const listInterval   = useRef<ReturnType<typeof setInterval> | null>(null)
  const detailInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // ── Fetch list ───────────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    if (!token) return
    try {
      const q = new URLSearchParams()
      if (statusFilter !== 'all') q.set('status', statusFilter)
      if (search) q.set('search', search)
      if (initialPhone && !search) q.set('phone', initialPhone)
      const res = await fetch(`/api/conversations?${q}`, { headers: h })
      if (!res.ok) return
      const data: ConvSummary[] = await res.json()
      setConversations(data)
      // Auto-open first conversation matching phone param
      if (initialPhone && !activeId && data.length > 0) {
        setActiveId(data[0].id)
        setNoConvPhone(null)
      } else if (initialPhone && data.length === 0 && !search) {
        setNoConvPhone(initialPhone)
      }
    } catch {}
    finally { setLoadingList(false) }
  }, [token, statusFilter, search, initialPhone]) // eslint-disable-line

  useEffect(() => {
    loadList()
    listInterval.current = setInterval(loadList, 5000)
    return () => { if (listInterval.current) clearInterval(listInterval.current) }
  }, [loadList])

  // ── Fetch detail ─────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    if (!token || !activeId) return
    try {
      const res = await fetch(`/api/conversations/${activeId}`, { headers: h })
      if (!res.ok) return
      const data: ConvDetail = await res.json()
      setDetail(data)
      setConversations(prev => prev.map(c => c.id === activeId ? { ...c, unreadCount: 0 } : c))
    } catch {}
    finally { setLoadingDetail(false) }
  }, [token, activeId]) // eslint-disable-line

  useEffect(() => {
    if (!activeId) { setDetail(null); return }
    setDetail(null)
    setLoadingDetail(true)
    loadDetail()
    detailInterval.current = setInterval(loadDetail, 5000)
    return () => { if (detailInterval.current) clearInterval(detailInterval.current) }
  }, [activeId, loadDetail])

  // Auto-scroll to bottom when messages load
  useEffect(() => {
    if (detail?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [detail?.messages.length])

  // ── Fetch tags ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    fetch('/api/support/tags', { headers: h })
      .then(r => r.json()).then(setTags).catch(() => {})
  }, [token]) // eslint-disable-line

  // ── Send message ─────────────────────────────────────────────────────────────
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  }

  async function sendMedia(mediaType: string, base64: string, caption?: string) {
    if (!activeId || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ mediaType, mediaBase64: base64, mediaCaption: caption }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadDetail()
      await loadList()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar mídia')
    } finally { setSending(false) }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const base64 = await blobToBase64(blob)
        await sendMedia('audio', base64)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecSeconds(0)
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      toast.error('Não foi possível acessar o microfone')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    setRecording(false)
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    audioChunksRef.current = []
    setRecording(false)
    setRecSeconds(0)
  }

  async function handleFileAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await blobToBase64(file)
    const mediaType = file.type.startsWith('image') ? 'image'
                    : file.type.startsWith('video') ? 'video'
                    : 'document'
    await sendMedia(mediaType, base64, file.name)
    e.target.value = ''
  }

  function fmtRec(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`
  }

  async function sendFirstMessage() {
    if (!noConvPhone || !startMsg.trim() || startingSend) return
    setStartingSend(true)
    try {
      const res = await fetch('/api/workspace/whatsapp/send', {
        method: 'POST', headers: h,
        body: JSON.stringify({ number: noConvPhone, text: startMsg.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar')
      toast.success('Mensagem enviada!')
      setStartMsg('')
      setNoConvPhone(null)
      setTimeout(() => loadList(), 2000)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar mensagem')
    } finally { setStartingSend(false) }
  }

  async function sendMessage() {
    if (!input.trim() || !activeId || sending) return
    setSending(true)
    const optimistic: Msg = {
      id: `opt-${Date.now()}`, content: input, direction: 'outbound',
      senderName: null, sentAt: new Date().toISOString(), reactions: [],
    }
    setDetail(prev => prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev)
    const text = input
    setInput('')
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: 'POST', headers: h, body: JSON.stringify({ content: text }),
      })
      if (!res.ok) throw new Error()
      await loadDetail()
      await loadList()
    } catch {
      toast.error('Erro ao enviar mensagem')
      setDetail(prev => prev ? { ...prev, messages: prev.messages.filter(m => m.id !== optimistic.id) } : prev)
      setInput(text)
    } finally { setSending(false) }
  }

  // ── Update status / assignment ────────────────────────────────────────────────
  async function updateConv(patch: Record<string, unknown>) {
    if (!activeId) return
    try {
      await fetch(`/api/conversations/${activeId}`, {
        method: 'PATCH', headers: h, body: JSON.stringify(patch),
      })
      await loadDetail()
      await loadList()
    } catch { toast.error('Erro ao atualizar') }
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────
  async function toggleTag(tagId: string) {
    if (!activeId || !detail) return
    const has = detail.tags.some(t => t.id === tagId)
    if (has) {
      await fetch(`/api/conversations/${activeId}/tags?tagId=${tagId}`, { method: 'DELETE', headers: h })
    } else {
      await fetch(`/api/conversations/${activeId}/tags`, {
        method: 'POST', headers: h, body: JSON.stringify({ tagId }),
      })
    }
    await loadDetail()
  }

  async function createTag() {
    if (!newTagName.trim()) return
    const res = await fetch('/api/support/tags', {
      method: 'POST', headers: h,
      body: JSON.stringify({ name: newTagName.trim(), color: '#6a11cb' }),
    })
    if (res.ok) {
      const tag = await res.json()
      setTags(prev => [...prev, tag])
      setNewTagName('')
    }
  }

  const filtered = conversations.filter(c => {
    const matchSearch = !search ||
      c.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      c.customerPhone.includes(search)
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title={`Conversas${totalUnread > 0 ? ` (${totalUnread})` : ''}`} />
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 border-r border-[#1e1635] bg-[#0a0818] flex flex-col">
          {/* Search + filter */}
          <div className="p-3 space-y-2 border-b border-[#1e1635]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conversa..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-[#1e1635] border border-[#2d2550] rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#6a11cb]"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'open', 'in_progress', 'closed'] as const).map(s => (
                <button key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${statusFilter === s ? 'bg-[#6a11cb] text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  {s === 'all' ? 'Todos' : s === 'open' ? 'Aberto' : s === 'in_progress' ? 'Andamento' : 'Fechado'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingList && (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-4 h-4 animate-spin text-[#6a11cb]" />
              </div>
            )}
            {!loadingList && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <MessageCircle className="w-6 h-6 text-slate-700" />
                <p className="text-xs text-slate-600">Nenhuma conversa</p>
              </div>
            )}
            {filtered.map(conv => (
              <button key={conv.id} onClick={() => setActiveId(conv.id)}
                className={`w-full text-left px-3 py-3 border-b border-[#1e1635]/40 transition-colors ${
                  activeId === conv.id
                    ? 'bg-[#6a11cb]/10 border-l-2 border-l-[#6a11cb]'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
                      {initials(conv.customerName, conv.customerPhone)}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0818]"
                      style={{ background: STATUS_COLORS[conv.status] ?? '#666' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white truncate">
                        {conv.customerName || conv.customerPhone}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {conv.unreadCount > 0 && (
                          <span className="w-4 h-4 bg-[#6a11cb] rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-600">{timeAgo(conv.lastMessageAt)}</span>
                      </div>
                    </div>
                    {conv.lastMessage && (
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {conv.lastMessage.direction === 'outbound' ? '↪ ' : ''}
                        {previewContent(conv.lastMessage.content)}
                      </p>
                    )}
                    {conv.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {conv.tags.slice(0, 3).map(t => (
                          <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: t.color + '22', color: t.color }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat area ─────────────────────────────────────────────────────── */}
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center">
            {noConvPhone ? (
              <div className="w-full max-w-md mx-auto px-6 space-y-4">
                <div className="text-center space-y-1">
                  <MessageCircle className="w-10 h-10 text-green-500/60 mx-auto" />
                  <p className="text-sm font-medium text-white">Iniciar conversa</p>
                  <p className="text-xs text-slate-500">Nenhuma conversa com <span className="text-slate-300">{noConvPhone}</span>. Envie a primeira mensagem.</p>
                </div>
                <div className="glass rounded-xl p-4 space-y-3">
                  <textarea
                    value={startMsg}
                    onChange={e => setStartMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFirstMessage() } }}
                    placeholder="Digite a mensagem..."
                    rows={3}
                    className="w-full bg-transparent text-sm text-white placeholder-slate-600 resize-none focus:outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <button onClick={() => setNoConvPhone(null)} className="text-xs text-slate-500 hover:text-white transition-colors">Cancelar</button>
                    <button
                      onClick={sendFirstMessage}
                      disabled={startingSend || !startMsg.trim()}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-40 transition-all"
                      style={{ background: 'linear-gradient(135deg,#6a11cb,#F5A314)' }}
                    >
                      {startingSend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <MessageCircle className="w-10 h-10 text-slate-700 mx-auto" />
                <p className="text-sm text-slate-500">Selecione uma conversa</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Chat header */}
            <div className="px-4 py-3 border-b border-[#1e1635] bg-[#0f0b1e]/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
                  {detail ? initials(detail.customerName, detail.customerPhone) : '…'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {detail?.customerName || detail?.customerPhone || '…'}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">{detail?.customerPhone}</p>
                    {detail?.assignedName && (
                      <span className="text-[10px] text-[#8b5cf6] bg-[#6a11cb]/10 px-1.5 py-0.5 rounded">
                        {detail.assignedName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Header actions */}
              <div className="flex items-center gap-1.5">
                {/* Status selector */}
                <div className="relative">
                  <button onClick={() => setShowAssign(false)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#2d2550] text-slate-300 hover:border-[#6a11cb]/50 transition-colors">
                    <Circle className="w-2.5 h-2.5 fill-current" style={{ color: STATUS_COLORS[detail?.status ?? 'open'] }} />
                    {STATUS_LABELS[detail?.status ?? 'open']}
                    <ChevronDown className="w-3 h-3 ml-0.5" />
                  </button>
                </div>
                {['open', 'in_progress', 'closed'].map(s => (
                  detail?.status !== s && (
                    <button key={s} onClick={() => updateConv({ status: s })}
                      className="text-[10px] px-2 py-1 rounded border border-[#2d2550] text-slate-500 hover:text-white hover:border-[#6a11cb]/50 transition-colors">
                      → {STATUS_LABELS[s]}
                    </button>
                  )
                ))}

                {/* Assign */}
                <div className="relative">
                  <button onClick={() => setShowAssign(s => !s)}
                    className="w-8 h-8 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                    <UserCheck className="w-3.5 h-3.5" />
                  </button>
                  {showAssign && detail && (
                    <div className="absolute right-0 top-10 z-50 w-48 bg-[#0f0b1e] border border-[#2d2550] rounded-xl shadow-2xl overflow-hidden">
                      <p className="text-[10px] text-slate-500 px-3 pt-2 pb-1 font-semibold uppercase tracking-wider">Atribuir para</p>
                      {detail.members.map(m => (
                        <button key={m.userId}
                          onClick={() => { updateConv({ assignedTo: m.userId }); setShowAssign(false) }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[#1e1635] transition-colors ${detail.assignedTo === m.userId ? 'text-[#8b5cf6]' : 'text-slate-300'}`}>
                          {detail.assignedTo === m.userId && <Check className="w-3 h-3" />}
                          <span className={detail.assignedTo === m.userId ? '' : 'ml-4'}>{m.name}</span>
                        </button>
                      ))}
                      {detail.assignedTo && (
                        <button onClick={() => { updateConv({ assignedTo: null }); setShowAssign(false) }}
                          className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[#1e1635] transition-colors">
                          Remover atribuição
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="relative">
                  <button onClick={() => setShowTagPanel(s => !s)}
                    className="w-8 h-8 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  {showTagPanel && detail && (
                    <div className="absolute right-0 top-10 z-50 w-52 bg-[#0f0b1e] border border-[#2d2550] rounded-xl shadow-2xl p-3 space-y-2">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Tags</p>
                      {tags.map(tag => {
                        const has = detail.tags.some(t => t.id === tag.id)
                        return (
                          <button key={tag.id} onClick={() => toggleTag(tag.id)}
                            className={`w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg transition-colors ${has ? 'bg-[#6a11cb]/10' : 'hover:bg-[#1e1635]'}`}>
                            {has ? <CheckCircle2 className="w-3.5 h-3.5 text-[#8b5cf6]" /> : <Circle className="w-3.5 h-3.5 text-slate-600" />}
                            <span className="font-medium" style={{ color: tag.color }}>{tag.name}</span>
                          </button>
                        )
                      })}
                      <div className="flex gap-1 pt-1 border-t border-[#1e1635]">
                        <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && createTag()}
                          placeholder="Nova tag..."
                          className="flex-1 text-xs bg-[#1e1635] border border-[#2d2550] rounded px-2 py-1 text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb]"
                        />
                        <button onClick={createTag}
                          className="w-7 h-7 flex items-center justify-center rounded bg-[#6a11cb] text-white hover:opacity-90">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={() => setActiveId(null)}
                  className="w-8 h-8 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tags display */}
            {detail?.tags && detail.tags.length > 0 && (
              <div className="px-4 py-1.5 flex gap-1.5 flex-wrap border-b border-[#1e1635]/50 bg-[#0a0818]">
                {detail.tags.map(t => (
                  <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                    style={{ background: t.color + '22', color: t.color }}>
                    {t.name}
                    <button onClick={() => toggleTag(t.id)} className="hover:opacity-70">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetail && !detail && (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="w-4 h-4 animate-spin text-[#6a11cb]" />
                </div>
              )}
              {detail?.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[72%] px-3 py-2 rounded-xl text-xs ${
                    msg.direction === 'outbound'
                      ? 'text-white rounded-br-sm'
                      : 'bg-[#0f0b1e] border border-[#1e1635] text-slate-200 rounded-bl-sm'
                  }`} style={msg.direction === 'outbound' ? { background: 'linear-gradient(135deg, #6a11cb, #2575fc)' } : {}}>
                    {msg.senderName && msg.direction === 'outbound' && (
                      <p className="text-[10px] text-white/60 mb-0.5">{msg.senderName}</p>
                    )}
                    <MessageContent content={msg.content} />
                    <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-white/50 text-right' : 'text-slate-600'}`}>
                      {new Date(msg.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-[#1e1635] bg-[#0f0b1e]/80 flex-shrink-0">
              <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileAttachment} />

              {recording ? (
                <div className="flex items-center gap-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="text-sm text-red-400 font-mono flex-1">{fmtRec(recSeconds)}</span>
                  <button onClick={cancelRecording} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded transition-colors">Cancelar</button>
                  <button onClick={stopRecording} disabled={sending}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                    Enviar
                  </button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mb-0.5">
                    <Paperclip className="w-4.5 h-4.5" />
                  </button>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder="Digite uma mensagem..."
                    rows={1}
                    className="flex-1 text-sm bg-[#1a1230] border border-[#2d2550] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none min-h-[40px] max-h-[120px]"
                    style={{ lineHeight: '1.4' }}
                    onInput={e => {
                      const t = e.currentTarget
                      t.style.height = 'auto'
                      t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                    }}
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0 mb-0.5">
                    <button onClick={startRecording}
                      className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-green-400 transition-colors"
                      title="Gravar áudio">
                      <Mic className="w-4 h-4" />
                    </button>
                    <button onClick={sendMessage} disabled={sending || !input.trim()}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all"
                      style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
