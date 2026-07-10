'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Save, Plus, Trash2, CheckCircle, Eye, EyeOff,
  Users, Loader2, Smartphone, RefreshCw,
  Wifi, WifiOff, Zap, ChevronDown, KeyRound, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

interface Stage {
  id: string; name: string; color: string; order: number; triggerCapiEvent: string
}
interface ProductRow {
  id: string; name: string; price: number; currency: string; description: string
}
interface Member {
  id: string; role: string
  user: { id: string; name: string; email: string }
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
  stages: Stage[]
  members: Member[]
}

const COLORS = ['#6a11cb','#2575fc','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Gerente', attendant: 'Atendente', viewer: 'Visualizador',
}
const ROLE_COLORS: Record<string, string> = {
  admin: '#F5A314', manager: '#8b5cf6', attendant: '#2575fc', viewer: '#64748b',
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

export default function SettingsPage() {
  const { token, currentWorkspace } = useAuthStore()
  const role = currentWorkspace?.role ?? 'viewer'
  const isAgency = currentWorkspace?.isAgency === true
  const canManage = ['admin', 'manager'].includes(role)

  // Meta CAPI and Contas only visible inside agency's own workspace
  const ALL_TABS = [
    { id: 'meta',       label: 'Meta CAPI',          agencyOnly: true },
    { id: 'contas',     label: 'Contas de Anúncios',  agencyOnly: true },
    { id: 'pipeline',   label: 'Pipeline',             agencyOnly: false },
    { id: 'produtos',   label: 'Produtos',              agencyOnly: false },
    { id: 'equipe',     label: 'Equipe',               agencyOnly: false },
    { id: 'whatsapp',   label: 'WhatsApp',             agencyOnly: false },
    { id: 'rastreio',   label: 'Rastreio',              agencyOnly: false },
  ]
  const tabs = ALL_TABS.filter(t => !t.agencyOnly || isAgency)

  const [tab, setTab] = useState(() => isAgency ? 'meta' : 'pipeline')
  const [ws, setWs] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Meta CAPI
  const [pixelId,   setPixelId]   = useState('')
  const [capiToken, setCapiToken] = useState('')

  // Contas de Anúncios
  const [adAccountId,      setAdAccountId]      = useState('')
  const [igAccountId,      setIgAccountId]      = useState('')
  const [googleCustomerId, setGoogleCustomerId] = useState('')

  // Pipeline stages
  const [stages, setStages] = useState<Stage[]>([])

  // Produtos
  const [products, setProducts] = useState<ProductRow[]>([])

  // WhatsApp — admin fields
  const [uazapiUrl,          setUazapiUrl]          = useState('')
  const [uazapiAdminToken,   setUazapiAdminToken]   = useState('')
  const [uazapiInstanceName, setUazapiInstanceName] = useState('')
  const [uazapiToken,        setUazapiToken]        = useState('')
  const [whatsappNumber,     setWhatsappNumber]     = useState('')
  const [creatingInstance,   setCreatingInstance]   = useState(false)

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
  const [resetPwFor, setResetPwFor] = useState<{ id: string; name: string } | null>(null)
  const [newPw, setNewPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // Rastreio (frases de atribuição pro webhook do WhatsApp)
  const [phrases, setPhrases] = useState<{ id: string; phrase: string; source: string; campaign: string | null }[]>([])
  const [loadingPhrases, setLoadingPhrases] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  const [newSource, setNewSource] = useState('')
  const [newCampaign, setNewCampaign] = useState('')
  const [addingPhrase, setAddingPhrase] = useState(false)

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/workspace', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const data: WorkspaceData = await res.json()
      setWs(data)
      setPixelId(data.metaPixelId ?? '')
      setCapiToken(data.metaAccessToken ?? '')
      setAdAccountId(data.metaAdAccountId ?? '')
      setIgAccountId(data.instagramAccountId ?? '')
      setGoogleCustomerId(data.googleAdsCustomerId ?? '')
      setStages(data.stages ?? [])
      setUazapiUrl(data.uazapiUrl ?? '')
      setUazapiAdminToken(data.uazapiAdminToken ?? '')
      setUazapiInstanceName(data.uazapiInstanceName ?? '')
      setUazapiToken(data.uazapiToken ?? '')
      setWhatsappNumber(data.whatsappNumber ?? '')

      const prodRes = await fetch('/api/products', { headers: { Authorization: `Bearer ${token}` } })
      if (prodRes.ok) {
        const prodData = await prodRes.json()
        setProducts(prodData.products ?? [])
      }
    } catch { toast.error('Erro ao carregar configurações') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  const loadPhrases = useCallback(async () => {
    if (!token) return
    setLoadingPhrases(true)
    try {
      const res = await fetch('/api/workspace/tracking-phrases', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setPhrases(d.phrases ?? []) }
    } finally { setLoadingPhrases(false) }
  }, [token])

  useEffect(() => { if (tab === 'rastreio') loadPhrases() }, [tab, loadPhrases])

  async function addPhrase() {
    if (!newPhrase.trim() || !newSource.trim()) { toast.error('Frase e origem são obrigatórios'); return }
    setAddingPhrase(true)
    try {
      const res = await fetch('/api/workspace/tracking-phrases', {
        method: 'POST', headers: h,
        body: JSON.stringify({ phrase: newPhrase.trim(), source: newSource.trim(), campaign: newCampaign.trim() || undefined }),
      })
      if (res.ok) {
        toast.success('Frase cadastrada')
        setNewPhrase(''); setNewSource(''); setNewCampaign('')
        loadPhrases()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erro ao cadastrar')
      }
    } finally { setAddingPhrase(false) }
  }

  async function deletePhrase(id: string) {
    const res = await fetch(`/api/workspace/tracking-phrases/${id}`, { method: 'DELETE', headers: h })
    if (res.ok) { toast.success('Removida'); loadPhrases() } else toast.error('Erro ao remover')
  }

  // Auto-check WhatsApp status once instance is loaded
  useEffect(() => {
    if (tab === 'whatsapp' && uazapiInstanceName && waStatus === 'unknown' && !loadingQr) {
      fetchQrCode()
    }
  }, [tab, uazapiInstanceName]) // eslint-disable-line

  async function saveMeta() {
    setSaving(true)
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ metaPixelId: pixelId, metaAccessToken: capiToken }),
      })
      if (!res.ok) throw new Error()
      toast.success('Meta CAPI salvo!')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  async function saveContas() {
    setSaving(true)
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ metaAdAccountId: adAccountId, instagramAccountId: igAccountId, googleAdsCustomerId: googleCustomerId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Contas salvas!')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  async function savePipeline() {
    setSaving(true)
    try {
      await Promise.all(stages.map((s, i) => {
        if (s.id.startsWith('new-')) {
          return fetch('/api/stages', {
            method: 'POST', headers: h,
            body: JSON.stringify({ name: s.name, color: s.color, order: i, triggerCapiEvent: s.triggerCapiEvent }),
          })
        }
        return fetch(`/api/stages/${s.id}`, {
          method: 'PATCH', headers: h,
          body: JSON.stringify({ name: s.name, color: s.color, order: i, triggerCapiEvent: s.triggerCapiEvent }),
        })
      }))
      toast.success('Pipeline salvo!')
      load()
    } catch { toast.error('Erro ao salvar pipeline') } finally { setSaving(false) }
  }

  async function deleteStage(id: string) {
    if (id.startsWith('new-')) { setStages(p => p.filter(s => s.id !== id)); return }
    try {
      const res = await fetch(`/api/stages/${id}`, { method: 'DELETE', headers: h })
      if (!res.ok) throw new Error()
      setStages(p => p.filter(s => s.id !== id))
      toast.success('Estágio removido')
    } catch { toast.error('Não foi possível remover — existem leads neste estágio') }
  }

  async function saveProducts() {
    setSaving(true)
    try {
      await Promise.all(products.map(p => {
        if (p.id.startsWith('new-')) {
          return fetch('/api/products', {
            method: 'POST', headers: h,
            body: JSON.stringify({ name: p.name, price: p.price, currency: p.currency, description: p.description }),
          })
        }
        return fetch(`/api/products/${p.id}`, {
          method: 'PATCH', headers: h,
          body: JSON.stringify({ name: p.name, price: p.price, currency: p.currency, description: p.description }),
        })
      }))
      toast.success('Produtos salvos!')
      load()
    } catch { toast.error('Erro ao salvar produtos') } finally { setSaving(false) }
  }

  async function deleteProduct(id: string) {
    if (id.startsWith('new-')) { setProducts(p => p.filter(x => x.id !== id)); return }
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: h })
      if (!res.ok) throw new Error()
      setProducts(p => p.filter(x => x.id !== id))
      toast.success('Produto removido')
    } catch { toast.error('Erro ao remover produto') }
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
  }

  function resetAddMemberForm() {
    setShowAddMember(false)
    setNewMemberName('')
    setNewMemberEmail('')
    setNewMemberPassword('')
    setNewMemberRole('viewer')
    setAccessMode('client')
    setSelectedClientId('')
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
        body: JSON.stringify({ name: newMemberName, email: newMemberEmail, password: newMemberPassword, role: newMemberRole }),
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

  const scriptUrl = currentWorkspace
    ? `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/t/${currentWorkspace.id}`
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
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t.id ? 'gradient-brand text-white' : 'text-slate-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Meta CAPI ── */}
          {tab === 'meta' && (
            <div className="glass rounded-2xl p-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Meta Conversions API</h2>
                <p className="text-xs text-slate-500 mt-1">Pixel ID e Access Token para envio de eventos de conversão ao Meta.</p>
              </div>
              {pixelId ? (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" /> Pixel conectado — ID: {pixelId}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg">
                  Pixel não configurado
                </div>
              )}
              <div className="space-y-4">
                <Field label="Pixel ID">
                  <TextInput value={pixelId} onChange={setPixelId} placeholder="Ex: 1234567890" />
                </Field>
                <Field label="Access Token (CAPI)">
                  <TextInput value={capiToken} onChange={setCapiToken} placeholder="EAAxxxxxxxx..." secret />
                </Field>
                <SaveBtn onClick={saveMeta} loading={saving} />
              </div>
              <div className="pt-4 border-t border-[#1e1635] space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Script de Rastreamento</p>
                <p className="text-xs text-slate-500">Adicione no &lt;head&gt; do site para capturar eventos automaticamente.</p>
                <div className="bg-[#080612] border border-[#1e1635] rounded-lg p-3 overflow-x-auto flex items-start justify-between gap-2">
                  <code className="text-xs text-[#8b5cf6] whitespace-pre">{`<script src="${scriptUrl}" async></script>`}</code>
                  <button onClick={() => { navigator.clipboard.writeText(`<script src="${scriptUrl}" async></script>`); toast.success('Copiado!') }}
                    className="text-xs text-slate-500 hover:text-white transition-colors flex-shrink-0">Copiar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Contas de Anúncios ── */}
          {tab === 'contas' && (
            <div className="glass rounded-2xl p-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Contas de Anúncios</h2>
                <p className="text-xs text-slate-500 mt-1">IDs das contas para sincronização automática de dados.</p>
              </div>
              <div className="space-y-4">
                <Field label="Ad Account ID (Meta Ads)">
                  <TextInput value={adAccountId} onChange={setAdAccountId} placeholder="act_123456789" />
                </Field>
                <Field label="Instagram Business Account ID">
                  <TextInput value={igAccountId} onChange={setIgAccountId} placeholder="17841234567890" />
                </Field>
                <div className="pt-4 border-t border-[#1e1635]">
                  <Field label="Customer ID (Google Ads)">
                    <TextInput value={googleCustomerId} onChange={setGoogleCustomerId} placeholder="123-456-7890" />
                  </Field>
                </div>
                <SaveBtn onClick={saveContas} loading={saving} />
              </div>
            </div>
          )}

          {/* ── Pipeline ── */}
          {tab === 'pipeline' && (
            <div className="glass rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Estágios do Pipeline</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {canManage ? 'Configure estágios e gatilhos de eventos CAPI.' : 'Estágios do seu pipeline de vendas.'}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => setStages(prev => [...prev, {
                      id: `new-${Date.now()}`, name: 'Novo Estágio',
                      color: '#6a11cb', order: prev.length, triggerCapiEvent: 'none',
                    }])}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg gradient-brand text-white font-medium hover:opacity-90">
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {stages.map(stage => (
                  <div key={stage.id} className="flex items-center gap-3 p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                    {canManage && (
                      <div className="flex gap-1 flex-shrink-0 flex-wrap max-w-[100px]">
                        {COLORS.map(c => (
                          <button key={c}
                            onClick={() => setStages(prev => prev.map(s => s.id === stage.id ? { ...s, color: c } : s))}
                            className={`w-3.5 h-3.5 rounded-full transition-all ${stage.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0f0b1e] scale-110' : 'opacity-50 hover:opacity-100'}`}
                            style={{ background: c }} />
                        ))}
                      </div>
                    )}
                    {!canManage && (
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                    )}
                    <input
                      value={stage.name}
                      readOnly={!canManage}
                      onChange={e => canManage && setStages(prev => prev.map(s => s.id === stage.id ? { ...s, name: e.target.value } : s))}
                      className="flex-1 text-sm bg-transparent text-white focus:outline-none border-b border-transparent focus:border-[#6a11cb] transition-colors min-w-0" />
                    {canManage && (
                      <>
                        <select
                          value={stage.triggerCapiEvent}
                          onChange={e => setStages(prev => prev.map(s => s.id === stage.id ? { ...s, triggerCapiEvent: e.target.value } : s))}
                          className="text-xs bg-[#1e1635] border border-[#2d2550] text-slate-300 rounded-lg px-2 py-1 focus:outline-none flex-shrink-0">
                          <option value="none">Sem evento</option>
                          <option value="lead">Lead event</option>
                          <option value="purchase">Purchase event</option>
                        </select>
                        <button onClick={() => deleteStage(stage.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {stages.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum estágio configurado.</p>
                )}
              </div>
              {canManage && <SaveBtn onClick={savePipeline} loading={saving} />}
            </div>
          )}

          {/* ── Produtos ── */}
          {tab === 'produtos' && (
            <div className="glass rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Produtos / Serviços</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {canManage ? 'Produtos vendidos e seus tickets — usados no popup de venda do Pipeline.' : 'Produtos e serviços vendidos.'}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => setProducts(prev => [...prev, {
                      id: `new-${Date.now()}`, name: 'Novo Produto',
                      price: 0, currency: 'BRL', description: '',
                    }])}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg gradient-brand text-white font-medium hover:opacity-90">
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {products.map(product => (
                  <div key={product.id} className="flex items-center gap-2 p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                    <input
                      value={product.name}
                      readOnly={!canManage}
                      placeholder="Nome do produto"
                      onChange={e => canManage && setProducts(prev => prev.map(p => p.id === product.id ? { ...p, name: e.target.value } : p))}
                      className="flex-1 text-sm bg-transparent text-white placeholder-slate-600 focus:outline-none border-b border-transparent focus:border-[#6a11cb] transition-colors min-w-0" />
                    <input
                      value={product.description}
                      readOnly={!canManage}
                      placeholder="Descrição (opcional)"
                      onChange={e => canManage && setProducts(prev => prev.map(p => p.id === product.id ? { ...p, description: e.target.value } : p))}
                      className="flex-1 text-xs bg-transparent text-slate-400 placeholder-slate-600 focus:outline-none border-b border-transparent focus:border-[#6a11cb] transition-colors min-w-0" />
                    {canManage && (
                      <>
                        <select
                          value={product.currency}
                          onChange={e => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, currency: e.target.value } : p))}
                          className="text-xs bg-[#1e1635] border border-[#2d2550] text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none flex-shrink-0">
                          <option value="BRL">R$</option>
                          <option value="USD">US$</option>
                        </select>
                        <input
                          type="number"
                          value={product.price}
                          onChange={e => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, price: parseFloat(e.target.value) || 0 } : p))}
                          placeholder="0,00"
                          className="w-24 text-sm bg-[#1e1635] border border-[#2d2550] text-white rounded-lg px-2 py-1.5 focus:outline-none flex-shrink-0" />
                        <button onClick={() => deleteProduct(product.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {!canManage && (
                      <span className="text-sm text-white flex-shrink-0">{product.currency === 'USD' ? 'US$' : 'R$'} {product.price.toLocaleString('pt-BR')}</span>
                    )}
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum produto configurado.</p>
                )}
              </div>
              {canManage && <SaveBtn onClick={saveProducts} loading={saving} />}
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
                        {Object.entries(ROLE_LABELS).map(([id, label]) => (
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
                      <button type="button" onClick={() => setAccessMode('agency')}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                        style={accessMode === 'agency'
                          ? { background: 'rgba(245,163,20,0.15)', borderColor: '#F5A314', color: '#fff' }
                          : { borderColor: '#2d2550', color: '#94a3b8' }}>
                        Agência (acesso total)
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
                  {accessMode === 'agency' && (
                    <p className="text-[11px] text-slate-500">Essa pessoa vai enxergar todos os clientes existentes e os que forem criados no futuro.</p>
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
                  const isSelf = m.user.id === (currentWorkspace as any)?.userId
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                      <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {m.user.name[0]}
                      </div>
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
                                background: `${ROLE_COLORS[m.role] ?? '#64748b'}18`,
                                borderColor: `${ROLE_COLORS[m.role] ?? '#64748b'}40`,
                                color: ROLE_COLORS[m.role] ?? '#64748b',
                              }}
                            >
                              {Object.entries(ROLE_LABELS).map(([id, label]) => (
                                <option key={id} value={id}>{label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                              style={{ color: ROLE_COLORS[m.role] ?? '#64748b' }} />
                          </div>
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
                          style={{ color: ROLE_COLORS[m.role] ?? '#64748b', background: `${ROLE_COLORS[m.role] ?? '#64748b'}18` }}>
                          {ROLE_LABELS[m.role] ?? m.role}
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

          {/* ── Rastreio ── */}
          {tab === 'rastreio' && (
            <div className="glass rounded-2xl p-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Frases de Rastreio</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Quando um contato novo manda uma mensagem no WhatsApp, o sistema tenta identificar a origem em duas etapas:
                  primeiro pelo contexto real de anúncio da Meta (automático, quando existe), e se não tiver, casa o texto da
                  mensagem contra as frases abaixo. Cadastre a frase aqui e cole o link gerado no botão de WhatsApp da página
                  (Google Ads, site, bio do Instagram) — ou registre a mesma frase usada num anúncio de mensagem da Meta, como
                  redundância caso o parâmetro de anúncio não chegue.
                </p>
              </div>

              {!whatsappNumber && (
                <div className="glass rounded-xl px-4 py-3 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20">
                  Configure o número do WhatsApp na aba <button onClick={() => setTab('whatsapp')} className="underline font-semibold">WhatsApp</button> pra gerar os links automaticamente.
                </div>
              )}

              {canManage && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <TextInput value={newPhrase} onChange={setNewPhrase} placeholder="Frase (ex: Vim do site)" />
                  <TextInput value={newSource} onChange={setNewSource} placeholder="Origem (ex: Google, Site)" />
                  <div className="flex gap-2">
                    <TextInput value={newCampaign} onChange={setNewCampaign} placeholder="Campanha (opcional)" />
                    <button onClick={addPhrase} disabled={addingPhrase}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg gradient-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                      {addingPhrase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {loadingPhrases ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-slate-500 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {phrases.map(p => {
                    const waLink = whatsappNumber
                      ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(p.phrase)}`
                      : null
                    return (
                      <div key={p.id} className="p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635] space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">&ldquo;{p.phrase}&rdquo;</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{p.source}{p.campaign ? ` · ${p.campaign}` : ''}</p>
                          </div>
                          {canManage && (
                            <button onClick={() => deletePhrase(p.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {waLink && (
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-[11px] text-green-300 bg-[#0a0818] border border-[#1e1635] rounded-lg px-2.5 py-1.5 font-mono truncate">{waLink}</code>
                            <button onClick={() => { navigator.clipboard.writeText(waLink); toast.success('Link copiado!') }}
                              className="text-[11px] text-slate-500 hover:text-white border border-[#2d2550] px-2 py-1.5 rounded-lg hover:border-[#6a11cb]/50 transition-all flex-shrink-0">
                              Copiar
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {phrases.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">Nenhuma frase cadastrada ainda.</p>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

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
