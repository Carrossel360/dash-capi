'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Save, Plus, Trash2, CheckCircle, Eye, EyeOff,
  Users, Loader2, Smartphone, RefreshCw,
  Wifi, WifiOff, Zap, ChevronDown, KeyRound, X, Rows3, Camera, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import { OPENAI_TEXT_MODELS, ANTHROPIC_TEXT_MODELS } from '@/lib/ai-models'

interface Member {
  id: string; role: string
  user: { id: string; name: string; email: string; avatarUrl?: string | null }
}
interface WorkspaceData {
  id: string; name: string
  metaPixelId: string | null
  metaAccessToken: string | null
  metaAdAccountId: string | null
  instagramAccountId: string | null
  googleAdsCustomerId: string | null
  uazapiUrl: string | null
  uazapiAdminToken: string | null
  uazapiInstanceName: string | null
  uazapiToken: string | null
  whatsappNumber: string | null
  telegramBotToken: string | null
  telegramChatId: string | null
  openaiApiKey: string | null
  anthropicApiKey: string | null
  members: Member[]
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Gerente', attendant: 'Atendente', viewer: 'Visualizador',
}
const ROLE_COLORS: Record<string, string> = {
  admin: '#F5A314', manager: '#8b5cf6', attendant: '#2575fc', viewer: '#64748b',
}
// Labels do lado Equipe (interno da agência) — mesmo enum Role, 3 opções em vez de 4
// (sem "attendant", que só existe do lado Cliente). Ver decisão registrada no plano C1.
const TEAM_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Operador', viewer: 'Visualizador',
}
const TEAM_ROLE_COLORS: Record<string, string> = {
  admin: '#F5A314', manager: '#8b5cf6', viewer: '#64748b',
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, secret, disabled }: {
  value: string; onChange?: (v: string) => void
  placeholder?: string; secret?: boolean; disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={secret && !show ? 'password' : 'text'}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors disabled:opacity-40"
        style={{ paddingRight: secret ? '2.5rem' : undefined }}
      />
      {secret && (
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  )
}

function SaveBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-brand text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      Salvar
    </button>
  )
}

// Foto de perfil de um membro da equipe — aparece no avatar do TopBar de quem está logado.
function MemberAvatar({ userId, name, avatarUrl, token, editable, onUploaded }: {
  userId: string; name: string; avatarUrl?: string | null; token: string | null
  editable: boolean; onUploaded: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`/api/workspace/members/${userId}/avatar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataUrl }),
      })
      const data = await res.json()
      if (res.ok) { onUploaded(data.avatarUrl); toast.success('Foto atualizada') }
      else toast.error('Erro ao enviar foto')
    } catch {
      toast.error('Erro ao enviar foto')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="relative w-8 h-8 flex-shrink-0 group/avatar">
      <div
        onClick={() => editable && inputRef.current?.click()}
        className={`w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-xs font-bold text-white overflow-hidden ${editable ? 'cursor-pointer' : ''}`}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : avatarUrl
          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
          : name[0]?.toUpperCase()}
      </div>
      {editable && !uploading && (
        <div onClick={() => inputRef.current?.click()}
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
          <Camera className="w-3 h-3 text-white" />
        </div>
      )}
      {editable && <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />}
    </div>
  )
}

export default function SettingsPage() {
  const { token, currentWorkspace, accessibleWorkspaces, updateUser, user: loggedInUser } = useAuthStore()
  const role = currentWorkspace?.role ?? 'viewer'
  const isAgency = currentWorkspace?.isAgency === true
  const canManage = ['admin', 'manager'].includes(role)
  // Diferente de isAgency (workspace atual): identifica se quem está logado é da
  // equipe da agência, independente de qual workspace está vendo no momento — um
  // cliente final nunca tem membership no workspace isAgency:true.
  const isAgencyStaff = accessibleWorkspaces.some(w => w.isAgency)

  const router = useRouter()

  // Configurações agora só é alcançável a partir do painel da própria agência (Sidebar esconde
  // o link quando um cliente está selecionado) — tudo que é específico de um cliente (Meta CAPI,
  // Contas de Anúncios, CRM/Produtos/Rastreio) fica em Clientes → [cliente] → Configurar. Aqui só
  // sobra o que é geral da agência: Clientes (atalho pra lista), Equipe, WhatsApp/Telegram
  // (notificações da própria agência) e Relatórios com IA (chaves + prompt padrão).
  const ALL_TABS = [
    { id: 'clientes',   label: 'Clientes',              staffOnly: false },
    { id: 'equipe',     label: 'Equipe',                staffOnly: false },
    { id: 'whatsapp',   label: 'WhatsApp / Telegram',   staffOnly: false },
    { id: 'relatorios-ia', label: 'Relatórios com IA',  staffOnly: true },
  ]
  const tabs = ALL_TABS.filter(t => !t.staffOnly || isAgencyStaff)

  const [tab, setTab] = useState('equipe')

  function handleTabClick(id: string) {
    if (id === 'clientes') { router.push('/clientes'); return }
    setTab(id)
  }

  useEffect(() => { if (!isAgency) router.push('/dashboard') }, [isAgency, router])

  const [ws, setWs] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // WhatsApp — admin fields
  const [uazapiUrl,          setUazapiUrl]          = useState('')
  const [uazapiAdminToken,   setUazapiAdminToken]   = useState('')
  const [uazapiInstanceName, setUazapiInstanceName] = useState('')
  const [uazapiToken,        setUazapiToken]        = useState('')
  const [whatsappNumber,     setWhatsappNumber]     = useState('')
  const [creatingInstance,   setCreatingInstance]   = useState(false)

  // Alertas — Telegram
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId,   setTelegramChatId]   = useState('')

  // Relatórios com IA — chaves globais (só isAgency) + config por cliente
  const [openaiApiKey,    setOpenaiApiKey]    = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [reportProvider,     setReportProvider]     = useState('openai')
  const [reportModel,        setReportModel]        = useState('')
  const [reportModelCustom,  setReportModelCustom]  = useState(false)
  const [reportCustomPrompt, setReportCustomPrompt] = useState('')
  const [loadingReportConfig, setLoadingReportConfig] = useState(false)

  // WhatsApp — QR / status (shared)
  const [qrCode,    setQrCode]    = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [waStatus,  setWaStatus]  = useState<'connected' | 'disconnected' | 'unknown'>('unknown')

  // Adicionar membro (Equipe)
  const [showAddMember, setShowAddMember] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberPassword, setNewMemberPassword] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [accessMode, setAccessMode] = useState<'client' | 'agency'>('client')
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [taskSpaces, setTaskSpaces] = useState<{ id: string; name: string; color: string }[]>([])
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [spacesFor, setSpacesFor] = useState<{ id: string; name: string } | null>(null)
  const [memberSpaceIds, setMemberSpaceIds] = useState<string[]>([])
  const [savingSpaces, setSavingSpaces] = useState(false)
  const [resetPwFor, setResetPwFor] = useState<{ id: string; name: string } | null>(null)
  const [newPw, setNewPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/workspace', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const data: WorkspaceData = await res.json()
      setWs(data)
      setUazapiUrl(data.uazapiUrl ?? '')
      setUazapiAdminToken(data.uazapiAdminToken ?? '')
      setUazapiInstanceName(data.uazapiInstanceName ?? '')
      setUazapiToken(data.uazapiToken ?? '')
      setWhatsappNumber(data.whatsappNumber ?? '')
      setTelegramBotToken(data.telegramBotToken ?? '')
      setTelegramChatId(data.telegramChatId ?? '')
      setOpenaiApiKey(data.openaiApiKey ?? '')
      setAnthropicApiKey(data.anthropicApiKey ?? '')
    } catch { toast.error('Erro ao carregar configurações') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  const loadReportConfig = useCallback(async () => {
    if (!token) return
    setLoadingReportConfig(true)
    try {
      const res = await fetch('/api/reports/config', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        const provider = d.config?.aiProvider ?? 'openai'
        const model = d.config?.aiModel ?? ''
        const knownModels = provider === 'openai' ? OPENAI_TEXT_MODELS : ANTHROPIC_TEXT_MODELS
        setReportProvider(provider)
        setReportModel(model)
        setReportModelCustom(model !== '' && !knownModels.some(m => m.value === model))
        setReportCustomPrompt(d.config?.customPrompt ?? '')
      }
    } finally { setLoadingReportConfig(false) }
  }, [token])

  useEffect(() => { if (tab === 'relatorios-ia') loadReportConfig() }, [tab, loadReportConfig])

  // Auto-check WhatsApp status once instance is loaded
  useEffect(() => {
    if (tab === 'whatsapp' && uazapiInstanceName && waStatus === 'unknown' && !loadingQr) {
      fetchQrCode()
    }
  }, [tab, uazapiInstanceName]) // eslint-disable-line

  async function saveAlertas() {
    setSaving(true)
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ telegramBotToken, telegramChatId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Alertas salvo!')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  async function saveAiKeys() {
    setSaving(true)
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ openaiApiKey, anthropicApiKey }),
      })
      if (!res.ok) throw new Error()
      toast.success('Chaves de API salvas!')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  async function saveReportConfig() {
    setSaving(true)
    try {
      const res = await fetch('/api/reports/config', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ aiProvider: reportProvider, aiModel: reportModel || null, customPrompt: reportCustomPrompt || null }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuração salva!')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  async function openAddMember() {
    setShowAddMember(true)
    if (clientOptions.length === 0) {
      try {
        const res = await fetch('/api/clients', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        setClientOptions((data.clients ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
      } catch { /* dropdown fica vazio, usuário pode tentar de novo */ }
    }
    if (taskSpaces.length === 0) {
      try {
        const res = await fetch('/api/tasks/spaces', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        setTaskSpaces((data.spaces ?? []).map((s: { id: string; name: string; color: string }) => ({ id: s.id, name: s.name, color: s.color })))
      } catch { /* lista fica vazia, usuário pode tentar de novo */ }
    }
  }

  function resetAddMemberForm() {
    setShowAddMember(false)
    setNewMemberName('')
    setNewMemberEmail('')
    setNewMemberPassword('')
    setNewMemberRole('viewer')
    setAccessMode('client')
    setSelectedClientId('')
    setSelectedSpaceIds([])
  }

  async function handleAddMember() {
    if (!newMemberName || !newMemberEmail || !newMemberPassword) {
      toast.error('Preencha nome, e-mail e senha'); return
    }
    if (accessMode === 'client' && !selectedClientId) {
      toast.error('Escolha um cliente'); return
    }

    setAddingMember(true)
    try {
      const url = accessMode === 'agency'
        ? '/api/workspace/members'
        : `/api/clients/${selectedClientId}/members`
      const res = await fetch(url, {
        method: 'POST', headers: h,
        body: JSON.stringify({
          name: newMemberName, email: newMemberEmail, password: newMemberPassword, role: newMemberRole,
          ...(accessMode === 'agency' && newMemberRole === 'viewer' ? { spaceIds: selectedSpaceIds } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao adicionar membro')
      toast.success(accessMode === 'agency' ? `Membro adicionado com acesso a ${data.clientsGranted} clientes` : 'Membro adicionado')
      resetAddMemberForm()
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar membro')
    } finally {
      setAddingMember(false)
    }
  }

  async function saveWhatsApp() {
    setSaving(true)
    try {
      await fetch('/api/workspace/whatsapp', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ uazapiUrl, uazapiAdminToken, uazapiInstanceName, uazapiToken, whatsappNumber }),
      })
      toast.success('WhatsApp salvo!')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  async function createInstance() {
    if (!uazapiUrl || !uazapiAdminToken) {
      toast.error('Preencha a URL e o Admin Token antes de criar a instância')
      return
    }
    setCreatingInstance(true)
    try {
      await fetch('/api/workspace/whatsapp', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ uazapiUrl, uazapiAdminToken, uazapiInstanceName }),
      })
      const res = await fetch('/api/workspace/whatsapp', { method: 'POST', headers: h })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.instanceToken) setUazapiToken(data.instanceToken)
      toast.success('Instância criada! Agora gere o QR Code para conectar.')
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar instância')
    } finally { setCreatingInstance(false) }
  }

  async function fetchQrCode() {
    setLoadingQr(true)
    setQrCode(null)
    try {
      const res = await fetch('/api/workspace/whatsapp', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.error) { toast.error(data.error); setWaStatus('disconnected'); return }
      const qr = data.qrcode ?? data.qr ?? data.base64 ?? data.QRCode ?? data.code ?? data.pairingCode ?? null
      if (data.status === 'connected' || data.state === 'open' || data.connectionStatus === 'CONNECTED') {
        setWaStatus('connected')
        setQrCode(null)
      } else if (qr) {
        setQrCode(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
        setWaStatus('disconnected')
      } else {
        // Log raw response to help debug unknown format
        console.warn('[whatsapp] unexpected response:', data)
        toast.error('Não foi possível obter QR Code. Verifique se a instância está correta.')
        setWaStatus('disconnected')
      }
    } catch { toast.error('Não foi possível conectar à UazAPI') }
    finally { setLoadingQr(false) }
  }

  const webhookUrl = currentWorkspace
    ? `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/webhooks/uazapi/${currentWorkspace.id}`
    : '...'

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Configurações" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Configurações" />
      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl">

          {currentWorkspace && (
            <div className="mb-4 text-xs text-slate-500">
              Configurando: <span className="text-white font-semibold">{currentWorkspace.name}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-[#0f0b1e] rounded-xl border border-[#1e1635] w-fit mb-5 flex-wrap">
            {tabs.map(t => (
              <button key={t.id} onClick={() => handleTabClick(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t.id ? 'gradient-brand text-white' : 'text-slate-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Telegram (notificações da agência) — parte da aba WhatsApp / Telegram ── */}
          {tab === 'whatsapp' && (
            <div className="glass rounded-2xl p-5 space-y-5 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Telegram</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Bot e grupo do Telegram que recebem os avisos de bloqueio de conta, campanha pausada e WhatsApp desconectado.
                </p>
              </div>
              <div className="space-y-4">
                <Field label="Bot Token">
                  <TextInput value={telegramBotToken} onChange={setTelegramBotToken} placeholder="123456:ABC-DEF..." secret />
                </Field>
                <Field label="Chat ID (grupo)">
                  <TextInput value={telegramChatId} onChange={setTelegramChatId} placeholder="-1001234567890" />
                </Field>
                <SaveBtn onClick={saveAlertas} loading={saving} />
              </div>
            </div>
          )}

          {/* ── Relatórios com IA ── */}
          {tab === 'relatorios-ia' && (
            <div className="space-y-5">
              <div className="glass rounded-2xl p-5 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-white">Chaves de API — Provedores de IA</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Usadas por todos os clientes para gerar Relatórios com IA (a chave da OpenAI também alimenta o Estúdio de Criação).
                  </p>
                </div>
                <div className="space-y-4">
                  <Field label="OpenAI API Key">
                    <TextInput value={openaiApiKey} onChange={setOpenaiApiKey} placeholder="sk-..." secret />
                  </Field>
                  <Field label="Anthropic API Key">
                    <TextInput value={anthropicApiKey} onChange={setAnthropicApiKey} placeholder="sk-ant-..." secret />
                  </Field>
                  <SaveBtn onClick={saveAiKeys} loading={saving} />
                </div>
              </div>

              <div className="glass rounded-2xl p-5 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-white">Configuração padrão da análise</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Provedor de IA e instrução customizada usados como padrão ao gerar Relatórios com IA para qualquer cliente.
                  </p>
                </div>
                {loadingReportConfig ? (
                  <div className="flex items-center justify-center py-6 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Field label="Provedor de IA">
                      <select
                        value={reportProvider}
                        onChange={e => { setReportProvider(e.target.value); setReportModel(''); setReportModelCustom(false) }}
                        className="w-full px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Claude (Anthropic)</option>
                      </select>
                    </Field>
                    <Field label="Modelo (opcional — deixe em branco para o padrão)">
                      <select
                        value={reportModelCustom ? 'custom' : reportModel}
                        onChange={e => {
                          if (e.target.value === 'custom') { setReportModelCustom(true); setReportModel('') }
                          else { setReportModelCustom(false); setReportModel(e.target.value) }
                        }}
                        className="w-full px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
                      >
                        <option value="">Padrão do provedor</option>
                        {(reportProvider === 'openai' ? OPENAI_TEXT_MODELS : ANTHROPIC_TEXT_MODELS).map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                        <option value="custom">Outro (digitar manualmente)</option>
                      </select>
                      {reportModelCustom && (
                        <input
                          type="text"
                          value={reportModel}
                          onChange={e => setReportModel(e.target.value)}
                          placeholder="ex: gpt-5.6-terra"
                          className="w-full mt-2 px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
                        />
                      )}
                    </Field>
                    <Field label="Prompt customizado (opcional)">
                      <textarea
                        value={reportCustomPrompt}
                        onChange={e => setReportCustomPrompt(e.target.value)}
                        placeholder="Ex: Foque em custo por lead e compare com o mês anterior"
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none"
                      />
                    </Field>
                    <SaveBtn onClick={saveReportConfig} loading={saving} />
                  </div>
                )}
              </div>

              <div className="glass rounded-2xl p-5 flex items-center gap-3 opacity-60">
                <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white">Agendamentos</p>
                  <p className="text-xs text-slate-500">Envio automático periódico de Relatórios com IA — em breve.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Equipe ── */}
          {tab === 'equipe' && (
            <div className="glass rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#8b5cf6]" /> Equipe
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Membros com acesso a <span className="text-white">{currentWorkspace?.name}</span>.</p>
                </div>
                {canManage && isAgency && !showAddMember && (
                  <button onClick={openAddMember}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-90 transition-all flex-shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Adicionar membro
                  </button>
                )}
              </div>

              {showAddMember && (
                <div className="p-4 rounded-xl border border-[#2d2550] bg-[#0f0b1e] space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nome">
                      <TextInput value={newMemberName} onChange={setNewMemberName} placeholder="Nome completo" />
                    </Field>
                    <Field label="E-mail">
                      <TextInput value={newMemberEmail} onChange={setNewMemberEmail} placeholder="email@exemplo.com" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Senha inicial">
                      <TextInput value={newMemberPassword} onChange={setNewMemberPassword} placeholder="Senha" secret />
                    </Field>
                    <Field label="Permissão">
                      <select
                        value={newMemberRole}
                        onChange={e => setNewMemberRole(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
                      >
                        {Object.entries(accessMode === 'agency' ? TEAM_ROLE_LABELS : ROLE_LABELS).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Acesso">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAccessMode('client')}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                        style={accessMode === 'client'
                          ? { background: 'rgba(106,17,203,0.15)', borderColor: '#6a11cb', color: '#fff' }
                          : { borderColor: '#2d2550', color: '#94a3b8' }}>
                        Cliente específico
                      </button>
                      <button type="button" onClick={() => { setAccessMode('agency'); if (newMemberRole === 'attendant') setNewMemberRole('viewer') }}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                        style={accessMode === 'agency'
                          ? { background: 'rgba(245,163,20,0.15)', borderColor: '#F5A314', color: '#fff' }
                          : { borderColor: '#2d2550', color: '#94a3b8' }}>
                        Agência (equipe interna)
                      </button>
                    </div>
                  </Field>

                  {accessMode === 'client' && (
                    <Field label="Cliente">
                      <select
                        value={selectedClientId}
                        onChange={e => setSelectedClientId(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
                      >
                        <option value="">Selecione um cliente...</option>
                        {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  )}
                  {accessMode === 'agency' && newMemberRole !== 'viewer' && (
                    <p className="text-[11px] text-slate-500">
                      {newMemberRole === 'admin'
                        ? 'Admin enxerga e gerencia tudo na agência, incluindo os clientes.'
                        : 'Operador enxerga e gerencia tudo — todos os Espaços de Tarefas e clientes, sem restrição.'}
                    </p>
                  )}
                  {accessMode === 'agency' && newMemberRole === 'viewer' && (
                    <Field label="Espaços de Tarefas com acesso">
                      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg border border-[#2d2550] bg-[#1e1635] max-h-32 overflow-y-auto">
                        {taskSpaces.length === 0 && <p className="text-[11px] text-slate-600 px-1">Nenhum space criado ainda em Tarefas.</p>}
                        {taskSpaces.map(s => {
                          const checked = selectedSpaceIds.includes(s.id)
                          return (
                            <button key={s.id} type="button"
                              onClick={() => setSelectedSpaceIds(prev => checked ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all"
                              style={checked
                                ? { background: `${s.color}22`, borderColor: s.color, color: '#fff' }
                                : { borderColor: '#2d2550', color: '#94a3b8' }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                              {s.name}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1">Sem nenhum selecionado, essa pessoa não vê nenhum space em Tarefas.</p>
                    </Field>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={handleAddMember} disabled={addingMember}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all">
                      {addingMember ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Adicionar
                    </button>
                    <button onClick={resetAddMemberForm}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 border border-[#2d2550] hover:text-white transition-all">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {(ws?.members ?? []).map(m => {
                  const isSelf = m.user.id === loggedInUser?.id
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                      <MemberAvatar
                        userId={m.user.id} name={m.user.name} avatarUrl={m.user.avatarUrl} token={token}
                        editable={canManage || isSelf}
                        onUploaded={url => {
                          setWs(prev => prev ? { ...prev, members: prev.members.map(mm => mm.user.id === m.user.id ? { ...mm, user: { ...mm.user, avatarUrl: url } } : mm) } : prev)
                          if (isSelf) updateUser({ avatarUrl: url })
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{m.user.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{m.user.email}</p>
                      </div>
                      {canManage ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="relative">
                            <select
                              value={m.role}
                              onChange={async e => {
                                const newRole = e.target.value
                                const res = await fetch(`/api/workspace/members/${m.user.id}`, {
                                  method: 'PATCH',
                                  headers: h,
                                  body: JSON.stringify({ role: newRole }),
                                })
                                if (res.ok) {
                                  toast.success('Permissão atualizada')
                                  load()
                                } else toast.error('Erro ao atualizar')
                              }}
                              className="appearance-none pl-2 pr-6 py-1 rounded-lg text-[11px] font-semibold border focus:outline-none cursor-pointer"
                              style={{
                                background: `${(isAgency ? TEAM_ROLE_COLORS : ROLE_COLORS)[m.role] ?? '#64748b'}18`,
                                borderColor: `${(isAgency ? TEAM_ROLE_COLORS : ROLE_COLORS)[m.role] ?? '#64748b'}40`,
                                color: (isAgency ? TEAM_ROLE_COLORS : ROLE_COLORS)[m.role] ?? '#64748b',
                              }}
                            >
                              {Object.entries(isAgency ? TEAM_ROLE_LABELS : ROLE_LABELS).map(([id, label]) => (
                                <option key={id} value={id}>{label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                              style={{ color: (isAgency ? TEAM_ROLE_COLORS : ROLE_COLORS)[m.role] ?? '#64748b' }} />
                          </div>
                          {isAgency && m.role === 'viewer' && (
                            <button
                              onClick={async () => {
                                setSpacesFor({ id: m.user.id, name: m.user.name })
                                if (taskSpaces.length === 0) {
                                  try {
                                    const res = await fetch('/api/tasks/spaces', { headers: { Authorization: `Bearer ${token}` } })
                                    const data = await res.json()
                                    setTaskSpaces((data.spaces ?? []).map((s: { id: string; name: string; color: string }) => ({ id: s.id, name: s.name, color: s.color })))
                                  } catch { /* lista fica vazia */ }
                                }
                                try {
                                  const res = await fetch(`/api/workspace/members/${m.user.id}/task-spaces`, { headers: { Authorization: `Bearer ${token}` } })
                                  const data = await res.json()
                                  setMemberSpaceIds(data.spaceIds ?? [])
                                } catch { setMemberSpaceIds([]) }
                              }}
                              title="Espaços de Tarefas com acesso"
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2d2550] text-slate-500 hover:text-white hover:border-[#6a11cb]/50 transition-all"
                            >
                              <Rows3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => { setResetPwFor({ id: m.user.id, name: m.user.name }); setNewPw('') }}
                            title="Resetar senha"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2d2550] text-slate-500 hover:text-white hover:border-[#6a11cb]/50 transition-all"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {!isSelf && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Remover ${m.user.name}?`)) return
                                const res = await fetch(`/api/workspace/members/${m.user.id}`, {
                                  method: 'DELETE', headers: h,
                                })
                                if (res.ok) { toast.success('Membro removido'); load() }
                                else toast.error('Erro ao remover')
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2d2550] text-slate-500 hover:text-red-400 hover:border-red-400/40 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{
                            color: (isAgency ? TEAM_ROLE_COLORS : ROLE_COLORS)[m.role] ?? '#64748b',
                            background: `${(isAgency ? TEAM_ROLE_COLORS : ROLE_COLORS)[m.role] ?? '#64748b'}18`,
                          }}>
                          {(isAgency ? TEAM_ROLE_LABELS : ROLE_LABELS)[m.role] ?? m.role}
                        </span>
                      )}
                    </div>
                  )
                })}
                {(ws?.members ?? []).length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum membro encontrado.</p>
                )}
              </div>
            </div>
          )}

          {/* ── WhatsApp ── */}
          {tab === 'whatsapp' && (
            <div className="space-y-4">

              {/* ─ ADMIN VIEW: full config — only in agency workspace ─ */}
              {canManage && isAgency && (
                <div className="glass rounded-2xl p-5 space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-green-400" /> Configuração UazAPI
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Conecte o servidor UazAPI e crie a instância deste workspace.</p>
                  </div>

                  <div className="space-y-4">
                    <Field label="URL do servidor UazAPI">
                      <TextInput value={uazapiUrl} onChange={setUazapiUrl} placeholder="http://seu-uazapi:8080" />
                    </Field>
                    <Field label="Admin Token (token global do servidor)">
                      <TextInput value={uazapiAdminToken} onChange={setUazapiAdminToken} placeholder="Token de administrador" secret />
                    </Field>
                    <Field label="Nome da instância">
                      <TextInput value={uazapiInstanceName} onChange={setUazapiInstanceName} placeholder="Ex: cliente-carlos" />
                    </Field>
                    <Field label="Número do WhatsApp (com DDI, só números)">
                      <TextInput value={whatsappNumber} onChange={setWhatsappNumber} placeholder="Ex: 5535999999999" />
                    </Field>
                  </div>

                  <div className="flex gap-2">
                    <SaveBtn onClick={saveWhatsApp} loading={saving} />
                    <button onClick={createInstance} disabled={creatingInstance || !uazapiUrl || !uazapiAdminToken}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 disabled:opacity-40 transition-all">
                      {creatingInstance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Criar instância
                    </button>
                  </div>

                  {uazapiToken && (
                    <div className="pt-4 border-t border-[#1e1635] space-y-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Token da instância</p>
                      <div className="flex gap-2">
                        <input readOnly value={uazapiToken}
                          className="flex-1 px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-400 font-mono" />
                        <button onClick={() => { navigator.clipboard.writeText(uazapiToken); toast.success('Copiado!') }}
                          className="px-3 py-2 rounded-lg border border-[#2d2550] text-slate-400 hover:text-[#6a11cb] transition-all text-xs">
                          Copiar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─ QR CODE SECTION (both admin and client) ─ */}
              <div className="glass rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-green-400" />
                      Conectar WhatsApp
                    </h2>
                    {uazapiInstanceName && (
                      <p className="text-xs text-slate-400 mt-1">
                        Instância: <span className="text-white font-medium">{uazapiInstanceName}</span>
                      </p>
                    )}
                  </div>
                  <button onClick={fetchQrCode} disabled={loadingQr || !uazapiInstanceName}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 disabled:opacity-40 transition-all">
                    {loadingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {loadingQr ? 'Verificando...' : waStatus === 'connected' ? 'Reconectar' : 'Gerar QR Code'}
                  </button>
                </div>

                {/* Status badge */}
                {waStatus === 'connected' && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-lg">
                    <Wifi className="w-3.5 h-3.5" /> WhatsApp conectado
                  </div>
                )}
                {waStatus === 'disconnected' && !qrCode && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg">
                    <WifiOff className="w-3.5 h-3.5" /> Desconectado — escaneie o QR Code abaixo para conectar
                  </div>
                )}

                {qrCode && (
                  <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                    <img src={qrCode} alt="QR Code WhatsApp" className="w-52 h-52" />
                    <p className="text-xs text-slate-800 text-center">
                      Abra o WhatsApp → Menu → Dispositivos vinculados → Vincular dispositivo
                    </p>
                  </div>
                )}

                {!qrCode && waStatus === 'unknown' && (
                  <p className="text-xs text-slate-500">
                    {uazapiInstanceName
                      ? 'Verificando status da conexão...'
                      : 'Nenhuma instância vinculada. Peça ao administrador para configurar o WhatsApp deste cliente.'}
                  </p>
                )}
              </div>

              {/* ─ ADMIN ONLY: Webhook URL — only in agency workspace ─ */}
              {canManage && isAgency && (
                <div className="glass rounded-2xl p-5 space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">URL do Webhook</p>
                  <p className="text-xs text-slate-500">Configure esta URL no painel da UazAPI para receber mensagens em tempo real.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-green-300 bg-[#0a0818] border border-[#1e1635] rounded-lg px-3 py-2 font-mono truncate">{webhookUrl}</code>
                    <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copiado!') }}
                      className="text-xs text-slate-500 hover:text-white border border-[#2d2550] px-2 py-2 rounded-lg hover:border-[#6a11cb]/50 transition-all flex-shrink-0">
                      Copiar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600">Events a ativar: <code className="text-slate-400">onmessage</code></p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {spacesFor && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSpacesFor(null)} />
          <div className="relative rounded-2xl w-full max-w-sm shadow-2xl z-10 p-5 space-y-4"
            style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Espaços de {spacesFor.name}</h3>
              <button onClick={() => setSpacesFor(null)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
              {taskSpaces.length === 0 && <p className="text-[11px] text-slate-600">Nenhum space criado ainda em Tarefas.</p>}
              {taskSpaces.map(s => {
                const checked = memberSpaceIds.includes(s.id)
                return (
                  <button key={s.id} type="button"
                    onClick={() => setMemberSpaceIds(prev => checked ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all"
                    style={checked
                      ? { background: `${s.color}22`, borderColor: s.color, color: '#fff' }
                      : { borderColor: '#2d2550', color: '#94a3b8' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    {s.name}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setSavingSpaces(true)
                  try {
                    const res = await fetch(`/api/workspace/members/${spacesFor.id}/task-spaces`, {
                      method: 'PUT', headers: h, body: JSON.stringify({ spaceIds: memberSpaceIds }),
                    })
                    if (res.ok) { toast.success('Espaços atualizados'); setSpacesFor(null) }
                    else toast.error('Erro ao atualizar espaços')
                  } finally { setSavingSpaces(false) }
                }}
                disabled={savingSpaces}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all">
                {savingSpaces ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rows3 className="w-3.5 h-3.5" />}
                Salvar
              </button>
              <button onClick={() => setSpacesFor(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 border border-[#2d2550] hover:text-white transition-all">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPwFor && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setResetPwFor(null)} />
          <div className="relative rounded-2xl w-full max-w-sm shadow-2xl z-10 p-5 space-y-4"
            style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Resetar senha de {resetPwFor.name}</h3>
              <button onClick={() => setResetPwFor(null)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Field label="Nova senha">
              <TextInput value={newPw} onChange={setNewPw} placeholder="Mínimo 6 caracteres" secret />
            </Field>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (newPw.length < 6) { toast.error('Senha deve ter ao menos 6 caracteres'); return }
                  setSavingPw(true)
                  try {
                    const res = await fetch(`/api/workspace/members/${resetPwFor.id}`, {
                      method: 'PATCH', headers: h, body: JSON.stringify({ newPassword: newPw }),
                    })
                    if (res.ok) { toast.success('Senha atualizada'); setResetPwFor(null) }
                    else toast.error('Erro ao atualizar senha')
                  } finally { setSavingPw(false) }
                }}
                disabled={savingPw}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg gradient-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all">
                {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Salvar
              </button>
              <button onClick={() => setResetPwFor(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 border border-[#2d2550] hover:text-white transition-all">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
