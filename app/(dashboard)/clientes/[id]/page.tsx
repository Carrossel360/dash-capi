'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Eye, EyeOff, Loader2, CheckCircle, Copy, Users, Zap, BarChart2,
  TrendingUp, Share2, MapPin, Star, DollarSign, MessageCircle, Sparkles, Globe,
  UserPlus, Trash2, ChevronDown, Key, Smartphone, Wifi, WifiOff, RefreshCw, Link2, Search,
  Webhook, AlertTriangle, Plus,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore, type WorkspaceInfo } from '@/lib/store/auth'

const TABS = [
  { id: 'geral', label: 'Geral' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'metricas', label: 'Métricas' },
  { id: 'meta', label: 'Meta CAPI' },
  { id: 'google', label: 'Google Ads' },
  { id: 'crm', label: 'CRM' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'rastreio', label: 'Rastreio' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'acesso', label: 'Acesso' },
]

const STAGE_COLORS = ['#6a11cb','#2575fc','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

const SEGMENTS = ['Estética', 'Jurídico', 'Academia', 'Imobiliário', 'Saúde', 'Educação', 'E-commerce', 'Outros']
const PLANS = [
  { id: 'starter', label: 'Starter' },
  { id: 'pro', label: 'Pro' },
  { id: 'agency', label: 'Agency' },
]
const SERVICES = [
  { key: 'svcMetaAds', label: 'Meta Ads', icon: TrendingUp, desc: 'Facebook + Instagram Ads' },
  { key: 'svcGoogleAds', label: 'Google Ads', icon: BarChart2, desc: 'Rede de Pesquisa + Display' },
  { key: 'svcSocialMedia', label: 'Social Media', icon: Share2, desc: 'Instagram + Facebook' },
  { key: 'svcGoogleBusiness', label: 'Google Business Profile', icon: MapPin, desc: 'Perfil no Maps + Avaliações' },
  { key: 'svcGoogleLocal', label: 'Google Local Service', icon: Star, desc: 'Anúncios locais do Google' },
  { key: 'svcContentStudio', label: 'Content Studio (IA)', icon: Sparkles, desc: 'Carrosséis gerados com IA' },
  { key: 'svcSiteGenerator', label: 'Gerador de Sites (IA)', icon: Globe, desc: 'Sites gerados com IA, código real' },
]

const META_METRICS = [
  { key: 'spend', label: 'Valor Gasto' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'reach', label: 'Alcance' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'cpc', label: 'CPC' },
  { key: 'cpm', label: 'CPM' },
  { key: 'ctr', label: 'CTR' },
  { key: 'link_clicks', label: 'Cliques no Link' },
  { key: 'cost_per_link_click', label: 'Custo por Clique no Link' },
  { key: 'messaging_conversations_started', label: 'Conversas Iniciadas' },
  { key: 'cost_per_conversation', label: 'Custo por Conversa' },
  { key: 'post_engagement', label: 'Engajamento da Publicação' },
  { key: 'followers', label: 'Seguidores' },
  { key: 'results', label: 'Resultados' },
  { key: 'cost_per_result', label: 'Custo/Resultado' },
  { key: 'leads_bc', label: 'Leads BC' },
  { key: 'profile_visits', label: 'Visitas no Perfil' },
]

const FUNNEL_METRICS = [
  { key: 'reach', label: 'Alcance' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'link_clicks', label: 'Cliques no Link' },
  { key: 'messaging_conversations_started', label: 'Conversas Iniciadas' },
  { key: 'leads_bc', label: 'Leads BC' },
  { key: 'results', label: 'Resultados/Vendas' },
]

const GOOGLE_FUNNEL_METRICS = [
  { key: 'impressions', label: 'Impressões' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'conversions', label: 'Conversões' },
  { key: 'leads_bc', label: 'Leads BC' },
  { key: 'spend', label: 'Valor Gasto' },
]

const GOOGLE_METRICS = [
  { key: 'spend', label: 'Valor Gasto' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC Médio' },
  { key: 'conversions', label: 'Conversões' },
  { key: 'cost_per_conversion', label: 'Custo/Conversão' },
  { key: 'roas', label: 'ROAS' },
  { key: 'quality_score', label: 'Índice de Qualidade' },
  { key: 'search_impression_share', label: 'Parcela de Impr. de Pesquisa' },
]

interface Stage { id: string; name: string; color: string; order: number; triggerCapiEvent: string }
interface ProductRow { id: string; name: string; price: number; currency: string; description: string }

interface ClientDetail {
  id: string; name: string; slug: string; segment: string | null
  plan: string; metaPixelId: string | null; metaAccessToken: string | null
  metaAdAccountId: string | null
  googleAdsCustomerId: string | null; localServicesAccountId: string | null; createdAt: string
  currency: string
  whatsappNumber: string | null
  svcMetaAds: boolean; svcGoogleAds: boolean; svcSocialMedia: boolean
  svcGoogleBusiness: boolean; svcGoogleLocal: boolean; svcContentStudio: boolean; svcSiteGenerator: boolean
  metaVisibleMetrics: string[]; googleVisibleMetrics: string[]; funnelMetrics: string[]; googleFunnelMetrics: string[]
  members: { id: string; role: string; user: { id: string; name: string; email: string } }[]
  stages: Stage[]
  _count: { leads: number; capiEvents: number; campaigns: number }
}

export default function ClienteDetailPage() {
  const { token, currentWorkspace, updateCurrentWorkspace } = useAuthStore()
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string
  const [tab, setTab] = useState('geral')
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [showGToken, setShowGToken] = useState(false)

  // whatsapp / instance management
  interface UazInstance { name: string; token: string; status: string }
  const [waTab, setWaTab] = useState<'existing' | 'new'>('existing')
  const [instances, setInstances] = useState<UazInstance[]>([])
  const [instancesLoaded, setInstancesLoaded] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState('')
  const [newInstanceName, setNewInstanceName] = useState('')
  const [waSaving, setWaSaving] = useState(false)
  const [linkedInstance, setLinkedInstance] = useState<string | null>(null)

  // webhook da instância — ver/ativar
  interface WebhookStatus { configured: boolean; currentUrl: string | null; isPointingHere: boolean; expectedUrl: string }
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookActivating, setWebhookActivating] = useState(false)

  // member management
  interface Member { memberId: string; userId: string; role: string; name: string; email: string }
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'viewer', show: false, showPass: false })
  const [addLoading, setAddLoading] = useState(false)
  const [resetStates, setResetStates] = useState<Record<string, { pass: string; show: boolean; saving: boolean }>>({})

  // form fields
  const [name, setName] = useState('')
  const [segment, setSegment] = useState('')
  const [plan, setPlan] = useState('starter')
  const [currency, setCurrency] = useState('BRL')
  const [metaPixelId, setMetaPixelId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaAdAccountId, setMetaAdAccountId] = useState('')
  const [metaAdAccounts, setMetaAdAccounts] = useState<{ id: string; name: string; account_status: number }[]>([])
  const [adAccountsLoaded, setAdAccountsLoaded] = useState(false)
  const [adAccountsLoading, setAdAccountsLoading] = useState(false)
  const [manualAdAccount, setManualAdAccount] = useState(false)
  const [acctPickerOpen, setAcctPickerOpen] = useState(false)
  const [acctSearch, setAcctSearch] = useState('')
  const acctPickerRef = useRef<HTMLDivElement>(null)
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState('')
  const [localServicesAccountId, setLocalServicesAccountId] = useState('')
  const [services, setServices] = useState({
    svcMetaAds: false, svcGoogleAds: false, svcSocialMedia: false,
    svcGoogleBusiness: false, svcGoogleLocal: false, svcContentStudio: false, svcSiteGenerator: false,
  })
  const [metaVisible, setMetaVisible] = useState<string[]>([])
  const [googleVisible, setGoogleVisible] = useState<string[]>([])
  const [funnelSel, setFunnelSel] = useState<string[]>([])
  const [googleFunnelSel, setGoogleFunnelSel] = useState<string[]>([])

  // CRM — estágios do pipeline
  const [stages, setStages] = useState<Stage[]>([])
  const [savingStages, setSavingStages] = useState(false)

  // Produtos
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productsLoaded, setProductsLoaded] = useState(false)
  const [savingProducts, setSavingProducts] = useState(false)

  // Rastreio — frases de atribuição + número do WhatsApp (usado pra gerar o link wa.me)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [savingWhatsappNumber, setSavingWhatsappNumber] = useState(false)
  const [phrases, setPhrases] = useState<{ id: string; phrase: string; source: string; campaign: string | null }[]>([])
  const [phrasesLoaded, setPhrasesLoaded] = useState(false)
  const [loadingPhrases, setLoadingPhrases] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  const [newSource, setNewSource] = useState('')
  const [newCampaign, setNewCampaign] = useState('')
  const [addingPhrase, setAddingPhrase] = useState(false)

  useEffect(() => {
    fetch(`/api/clients/${clientId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const w = d.workspace as ClientDetail
        setClient(w)
        setName(w.name ?? '')
        setSegment(w.segment ?? '')
        setPlan(w.plan ?? 'starter')
        setCurrency(w.currency ?? 'BRL')
        setMetaPixelId(w.metaPixelId ?? '')
        setMetaAdAccountId(w.metaAdAccountId ?? '')
        setGoogleAdsCustomerId(w.googleAdsCustomerId ?? '')
        setLocalServicesAccountId(w.localServicesAccountId ?? '')
        setWhatsappNumber(w.whatsappNumber ?? '')
        setStages(w.stages ?? [])
        setServices({
          svcMetaAds: w.svcMetaAds ?? false,
          svcGoogleAds: w.svcGoogleAds ?? false,
          svcSocialMedia: w.svcSocialMedia ?? false,
          svcGoogleBusiness: w.svcGoogleBusiness ?? false,
          svcGoogleLocal: w.svcGoogleLocal ?? false,
          svcContentStudio: w.svcContentStudio ?? false,
          svcSiteGenerator: w.svcSiteGenerator ?? false,
        })
        setMetaVisible(w.metaVisibleMetrics ?? [])
        setGoogleVisible(w.googleVisibleMetrics ?? [])
        setFunnelSel(w.funnelMetrics ?? [])
        setGoogleFunnelSel(w.googleFunnelMetrics ?? [])
      })
      .finally(() => setLoading(false))
  }, [clientId, token])

  async function handleSave(extra: Record<string, unknown> = {}) {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { name, segment, plan, currency, ...services, ...extra }
      if (metaPixelId) body.metaPixelId = metaPixelId
      if (metaAccessToken) body.metaAccessToken = metaAccessToken
      if (metaAdAccountId) body.metaAdAccountId = metaAdAccountId
      if (googleAdsCustomerId) body.googleAdsCustomerId = googleAdsCustomerId
      if (localServicesAccountId) body.localServicesAccountId = localServicesAccountId

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      // sync Zustand store so dashboard pages reflect changes immediately
      if (currentWorkspace?.id === clientId) {
        const updates: Partial<WorkspaceInfo> = {}
        if (body.currency !== undefined) updates.currency = body.currency as string
        if (body.metaVisibleMetrics !== undefined) updates.metaVisibleMetrics = body.metaVisibleMetrics as string[]
        if (body.googleVisibleMetrics !== undefined) updates.googleVisibleMetrics = body.googleVisibleMetrics as string[]
        if (body.funnelMetrics !== undefined) updates.funnelMetrics = body.funnelMetrics as string[]
        if (Object.keys(updates).length > 0) updateCurrentWorkspace(updates)
        // `services` (toggles de serviço contratado) não tem um mapeamento 1:1 simples com o
        // body do PATCH — busca de /api/auth/me pra pegar o shape já resolvido (mesma fonte
        // usada no refresh automático de app/(dashboard)/layout.tsx) em vez de duplicar aqui.
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.workspace) updateCurrentWorkspace(d.workspace) })
          .catch(() => {})
      }
      toast.success('Configurações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function toggleMetric(key: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(key) ? list.filter(k => k !== key) : [...list, key])
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (acctPickerRef.current && !acctPickerRef.current.contains(e.target as Node)) {
        setAcctPickerOpen(false)
        setAcctSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (tab === 'whatsapp' && !instancesLoaded) {
      fetch('/api/agency/instances', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.instances) {
            setInstances(d.instances)
          } else if (d.error) {
            const detail = d.details?.join('\n') ?? ''
            toast.error(`${d.error}${detail ? '\n' + detail : ''}`, { duration: 8000 })
          }
        })
        .finally(() => setInstancesLoaded(true))
      // also load current client whatsapp config
      fetch(`/api/clients/${clientId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          const w = d.workspace as any
          if (w?.uazapiInstanceName) setLinkedInstance(w.uazapiInstanceName)
          if (w?.uazapiInstanceName) setSelectedInstance(w.uazapiInstanceName)
        })
    }
    if (tab === 'meta' && !adAccountsLoaded) {
      setAdAccountsLoading(true)
      fetch('/api/meta/ad-accounts', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.accounts) setMetaAdAccounts(d.accounts)
          else if (d.error) toast.error(d.error)
        })
        .finally(() => { setAdAccountsLoaded(true); setAdAccountsLoading(false) })
    }
    if (tab === 'produtos' && !productsLoaded) {
      fetch(`/api/clients/${clientId}/products`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setProducts(d.products ?? []))
        .finally(() => setProductsLoaded(true))
    }
    if (tab === 'rastreio' && !phrasesLoaded) {
      loadPhrases()
    }
  }, [tab])

  function loadPhrases() {
    setLoadingPhrases(true)
    fetch(`/api/clients/${clientId}/tracking-phrases`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setPhrases(d.phrases ?? []))
      .finally(() => { setLoadingPhrases(false); setPhrasesLoaded(true) })
  }

  async function addPhrase() {
    if (!newPhrase.trim() || !newSource.trim()) { toast.error('Frase e origem são obrigatórios'); return }
    setAddingPhrase(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/tracking-phrases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    const res = await fetch(`/api/clients/${clientId}/tracking-phrases/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) { toast.success('Removida'); loadPhrases() } else toast.error('Erro ao remover')
  }

  async function saveWhatsappNumber() {
    setSavingWhatsappNumber(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ whatsappNumber }),
      })
      if (!res.ok) throw new Error()
      toast.success('Número salvo!')
    } catch { toast.error('Erro ao salvar') } finally { setSavingWhatsappNumber(false) }
  }

  async function saveStages() {
    setSavingStages(true)
    try {
      await Promise.all(stages.map((s, i) => {
        if (s.id.startsWith('new-')) {
          return fetch(`/api/clients/${clientId}/stages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: s.name, color: s.color, order: i, triggerCapiEvent: s.triggerCapiEvent }),
          })
        }
        return fetch(`/api/clients/${clientId}/stages/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: s.name, color: s.color, order: i, triggerCapiEvent: s.triggerCapiEvent }),
        })
      }))
      toast.success('CRM salvo!')
      const res = await fetch(`/api/clients/${clientId}/stages`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setStages(await res.json())
    } catch { toast.error('Erro ao salvar estágios') } finally { setSavingStages(false) }
  }

  async function deleteStage(id: string) {
    if (id.startsWith('new-')) { setStages(p => p.filter(s => s.id !== id)); return }
    try {
      const res = await fetch(`/api/clients/${clientId}/stages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      setStages(p => p.filter(s => s.id !== id))
      toast.success('Estágio removido')
    } catch { toast.error('Não foi possível remover — existem leads neste estágio') }
  }

  async function saveProductsList() {
    setSavingProducts(true)
    try {
      await Promise.all(products.map(p => {
        if (p.id.startsWith('new-')) {
          return fetch(`/api/clients/${clientId}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: p.name, price: p.price, currency: p.currency, description: p.description }),
          })
        }
        return fetch(`/api/clients/${clientId}/products/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: p.name, price: p.price, currency: p.currency, description: p.description }),
        })
      }))
      toast.success('Produtos salvos!')
      const res = await fetch(`/api/clients/${clientId}/products`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setProducts((await res.json()).products ?? [])
    } catch { toast.error('Erro ao salvar produtos') } finally { setSavingProducts(false) }
  }

  async function deleteProductRow(id: string) {
    if (id.startsWith('new-')) { setProducts(p => p.filter(x => x.id !== id)); return }
    try {
      const res = await fetch(`/api/clients/${clientId}/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      setProducts(p => p.filter(x => x.id !== id))
      toast.success('Produto removido')
    } catch { toast.error('Erro ao remover produto') }
  }

  async function handleLinkInstance() {
    const inst = instances.find(i => i.name === selectedInstance || i.token === selectedInstance)
    if (!inst) { toast.error('Selecione uma instância'); return }
    setWaSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ instanceName: inst.name, instanceToken: inst.token }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setLinkedInstance(inst.name)
      toast.success(`Instância "${inst.name}" vinculada!`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao vincular')
    } finally { setWaSaving(false) }
  }

  async function handleCreateAndLink() {
    if (!newInstanceName.trim()) { toast.error('Digite o nome da instância'); return }
    setWaSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ createNew: true, instanceName: newInstanceName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLinkedInstance(newInstanceName.trim())
      setInstancesLoaded(false) // reload list
      toast.success('Instância criada e vinculada!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar instância')
    } finally { setWaSaving(false) }
  }

  function loadWebhookStatus() {
    setWebhookLoading(true)
    fetch(`/api/clients/${clientId}/whatsapp/webhook`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!d.error) setWebhookStatus(d) })
      .finally(() => setWebhookLoading(false))
  }

  // Ação explícita e manual — nunca dispara sozinha ao vincular a instância. Troca o webhook
  // dessa instância na UazAPI pra apontar pra este sistema, o que redireciona o que estiver
  // configurado ali hoje (ex: uma automação externa alimentando o CRM antigo).
  async function handleActivateWebhook() {
    if (!confirm('Isso vai trocar o webhook dessa instância na UazAPI pra apontar pra este sistema, substituindo o que estiver configurado hoje. Continuar?')) return
    setWebhookActivating(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp/webhook`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Webhook ativado!')
      loadWebhookStatus()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao ativar webhook')
    } finally { setWebhookActivating(false) }
  }

  useEffect(() => {
    if (tab === 'whatsapp' && linkedInstance && !webhookStatus && !webhookLoading) {
      loadWebhookStatus()
    }
  }, [tab, linkedInstance])

  useEffect(() => {
    if (tab === 'acesso' && !membersLoaded) {
      fetch(`/api/clients/${clientId}/members`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.members) setMembers(d.members) })
        .finally(() => setMembersLoaded(true))
    }
  }, [tab])

  function loadMembers() {
    fetch(`/api/clients/${clientId}/members`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.members) setMembers(d.members) })
      .finally(() => setMembersLoaded(true))
  }

  async function handleAddMember() {
    if (!addForm.name || !addForm.email || !addForm.password) {
      toast.error('Preencha nome, e-mail e senha')
      return
    }
    setAddLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: addForm.name, email: addForm.email, password: addForm.password, role: addForm.role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMembers(prev => [...prev, data])
      setAddForm({ name: '', email: '', password: '', role: 'viewer', show: false, showPass: false })
      toast.success('Acesso criado!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    await fetch(`/api/clients/${clientId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    })
    setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m))
    toast.success('Permissão atualizada')
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remover este acesso?')) return
    const res = await fetch(`/api/clients/${clientId}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.userId !== userId))
      toast.success('Acesso removido')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Erro ao remover')
    }
  }

  async function handleResetPassword(userId: string) {
    const st = resetStates[userId]
    if (!st?.pass) { toast.error('Digite a nova senha'); return }
    setResetStates(prev => ({ ...prev, [userId]: { ...prev[userId], saving: true } }))
    const res = await fetch(`/api/clients/${clientId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: st.pass }),
    })
    setResetStates(prev => ({ ...prev, [userId]: { ...prev[userId], saving: false, pass: '' } }))
    if (res.ok) toast.success('Senha alterada!')
    else toast.error('Erro ao alterar senha')
  }

  const ROLES = [
    { id: 'admin', label: 'Admin', color: '#F5A314' },
    { id: 'manager', label: 'Gerente', color: '#8b5cf6' },
    { id: 'attendant', label: 'Atendente', color: '#2575fc' },
    { id: 'viewer', label: 'Visualizador', color: '#64748b' },
  ]
  function roleLabel(r: string) { return ROLES.find(x => x.id === r)?.label ?? r }
  function roleColor(r: string) { return ROLES.find(x => x.id === r)?.color ?? '#64748b' }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://seudominio.com'
  const trackerScript = `<script src="${origin}/api/t/${clientId}" async></script>`
  const webhookUrl = `${origin}/api/webhooks/whatsapp/${clientId}`

  const acctQ = acctSearch.trim().toLowerCase()
  const filteredAdAccounts = acctQ
    ? metaAdAccounts.filter(a => a.name.toLowerCase().includes(acctQ) || a.id.includes(acctQ))
    : metaAdAccounts
  const selectedAdAccount = metaAdAccounts.find(a => a.id === metaAdAccountId)

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Configurar Cliente" hideWorkspaceSwitcher />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#6a11cb' }} />
        </div>
      </div>
    )
  }

  const SaveBtn = ({ extra }: { extra?: Record<string, unknown> }) => (
    <button onClick={() => handleSave(extra)} disabled={saving}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
      style={{ background: '#6a11cb', color: '#fff', boxShadow: saving ? 'none' : '0 4px 16px rgba(106,17,203,0.3)' }}
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      Salvar
    </button>
  )

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: '#0f0b1e', color: '#e2e8f0', border: '1px solid #2d2550', borderRadius: '10px', fontSize: '13px' } }} />
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title={`Configurando: ${client?.name ?? '...'}`} hideWorkspaceSwitcher />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl space-y-5">

            {/* Back + Stats */}
            <div className="flex items-center justify-between">
              <button onClick={() => router.push('/clientes')}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Todos os clientes
              </button>
              {client?._count && (
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{client._count.leads} leads</span>
                  <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />{client._count.capiEvents} eventos</span>
                  <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" />{client._count.campaigns} campanhas</span>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl border border-[#1e1635] w-fit flex-wrap" style={{ background: '#0f0b1e' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                  style={tab === t.id ? { background: '#6a11cb' } : {}}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ─── Geral ─── */}
            {tab === 'geral' && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">Informações do cliente</h2>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Nome</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Segmento</label>
                    <select value={segment} onChange={e => setSegment(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-300 focus:outline-none focus:border-[#6a11cb]"
                    >
                      <option value="">Selecionar...</option>
                      {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Plano</label>
                    <select value={plan} onChange={e => setPlan(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-300 focus:outline-none focus:border-[#6a11cb]"
                    >
                      {PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
                {/* Moeda */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Moeda dos relatórios
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'BRL', label: '🇧🇷 Real Brasileiro (R$)' },
                      { id: 'USD', label: '🇺🇸 Dólar Americano (US$)' },
                    ].map(c => (
                      <button key={c.id} onClick={() => setCurrency(c.id)}
                        className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                          currency === c.id ? 'border-[#6a11cb] bg-[#6a11cb]/10 text-white' : 'border-[#2d2550] text-slate-400'
                        }`}
                      >{c.label}</button>
                    ))}
                  </div>
                </div>
                <SaveBtn />
              </div>
            )}

            {/* ─── Serviços ─── */}
            {tab === 'servicos' && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Serviços contratados</h2>
                  <p className="text-xs text-slate-500 mt-1">Defina quais módulos o cliente tem acesso no portal.</p>
                </div>
                <div className="space-y-2">
                  {SERVICES.map(({ key, label, icon: Icon, desc }) => {
                    const active = services[key as keyof typeof services]
                    return (
                      <button key={key}
                        onClick={() => setServices(prev => ({ ...prev, [key]: !prev[key as keyof typeof services] }))}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                          active ? 'border-[#6a11cb]/60 bg-[#6a11cb]/8' : 'border-[#1e1635] hover:border-[#2d2550]'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          active ? 'bg-[#6a11cb]/20' : 'bg-[#1a1230]'
                        }`}>
                          <Icon className="w-4 h-4" style={{ color: active ? '#8b5cf6' : '#475569' }} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-400'}`}>{label}</p>
                          <p className="text-xs text-slate-600">{desc}</p>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          active ? 'border-[#6a11cb] bg-[#6a11cb]' : 'border-[#2d2550]'
                        }`}>
                          {active && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <SaveBtn extra={services} />
              </div>
            )}

            {/* ─── Métricas ─── */}
            {tab === 'metricas' && (
              <div className="space-y-4">
                {/* Meta Ads metrics */}
                <div className="glass rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Métricas Meta Ads visíveis</h2>
                    <p className="text-xs text-slate-500 mt-1">Selecione quais métricas aparecem no dashboard de Tráfego Pago.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {META_METRICS.map(m => {
                      const on = metaVisible.includes(m.key)
                      return (
                        <button key={m.key} onClick={() => toggleMetric(m.key, metaVisible, setMetaVisible)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                            on ? 'border-[#6a11cb]/50 bg-[#6a11cb]/8 text-white' : 'border-[#1e1635] text-slate-500 hover:border-[#2d2550]'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                            on ? 'bg-[#6a11cb]' : 'border border-[#2d2550]'
                          }`}>
                            {on && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                          </div>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Funil */}
                <div className="glass rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Etapas do funil de conversão</h2>
                    <p className="text-xs text-slate-500 mt-1">Escolha as métricas que formam o funil (máx. 6, em ordem).</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {FUNNEL_METRICS.map(m => {
                      const on = funnelSel.includes(m.key)
                      const idx = funnelSel.indexOf(m.key)
                      return (
                        <button key={m.key} onClick={() => toggleMetric(m.key, funnelSel, setFunnelSel)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                            on ? 'border-[#F5A314]/50 bg-[#F5A314]/8 text-white' : 'border-[#1e1635] text-slate-500 hover:border-[#2d2550]'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                            on ? 'bg-[#F5A314] text-[#06040f]' : 'bg-[#1e1635] text-slate-600'
                          }`}>
                            {on ? idx + 1 : ''}
                          </span>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Google Ads */}
                <div className="glass rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Métricas Google Ads visíveis</h2>
                    <p className="text-xs text-slate-500 mt-1">Selecione quais métricas aparecem na aba Google Ads.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {GOOGLE_METRICS.map(m => {
                      const on = googleVisible.includes(m.key)
                      return (
                        <button key={m.key} onClick={() => toggleMetric(m.key, googleVisible, setGoogleVisible)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                            on ? 'border-[#6a11cb]/50 bg-[#6a11cb]/8 text-white' : 'border-[#1e1635] text-slate-500 hover:border-[#2d2550]'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                            on ? 'bg-[#6a11cb]' : 'border border-[#2d2550]'
                          }`}>
                            {on && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                          </div>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Funil Google Ads */}
                <div className="glass rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Etapas do funil de conversão (Google Ads)</h2>
                    <p className="text-xs text-slate-500 mt-1">Escolha as métricas que formam o funil do Google Ads (em ordem).</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {GOOGLE_FUNNEL_METRICS.map(m => {
                      const on = googleFunnelSel.includes(m.key)
                      const idx = googleFunnelSel.indexOf(m.key)
                      return (
                        <button key={m.key} onClick={() => toggleMetric(m.key, googleFunnelSel, setGoogleFunnelSel)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                            on ? 'border-[#F5A314]/50 bg-[#F5A314]/8 text-white' : 'border-[#1e1635] text-slate-500 hover:border-[#2d2550]'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                            on ? 'bg-[#F5A314] text-[#06040f]' : 'bg-[#1e1635] text-slate-600'
                          }`}>
                            {on ? idx + 1 : ''}
                          </span>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <SaveBtn extra={{ metaVisibleMetrics: metaVisible, googleVisibleMetrics: googleVisible, funnelMetrics: funnelSel, googleFunnelMetrics: googleFunnelSel }} />
              </div>
            )}

            {/* ─── Meta CAPI ─── */}
            {tab === 'meta' && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Meta Conversions API</h2>
                  <p className="text-xs text-slate-500 mt-1">Pixel e token para envio de eventos CAPI deste cliente.</p>
                </div>
                {client?.metaPixelId && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Pixel conectado — ID: {client.metaPixelId}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Pixel ID</label>
                  <input value={metaPixelId} onChange={e => setMetaPixelId(e.target.value)}
                    placeholder="Ex: 1234567890"
                    className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Access Token (CAPI)</label>
                  <div className="relative">
                    <input type={showToken ? 'text' : 'password'} value={metaAccessToken}
                      onChange={e => setMetaAccessToken(e.target.value)}
                      placeholder={client?.metaAccessToken ? '••••••••• (salvo)' : 'EAAxxxxxxxx...'}
                      className="w-full px-3 py-2.5 pr-10 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                    />
                    <button type="button" onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="pt-3 border-t border-[#1e1635] space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sincronização de gasto (Meta Ads)</p>
                    <p className="text-xs text-slate-500 mt-1">ID da conta de anúncio deste cliente — usado para buscar gasto/impressões/cliques direto da Meta (diferente do Pixel/Token acima, que é da CAPI).</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-400">Conta de Anúncio</label>
                      <button type="button" onClick={() => setManualAdAccount(v => !v)}
                        className="text-[11px] text-slate-500 hover:text-[#6a11cb]">
                        {manualAdAccount ? 'Escolher da lista' : 'Digitar ID manualmente'}
                      </button>
                    </div>
                    {manualAdAccount ? (
                      <input value={metaAdAccountId} onChange={e => setMetaAdAccountId(e.target.value)}
                        placeholder="Ex: 123456789012345 (sem o prefixo act_)"
                        className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                      />
                    ) : adAccountsLoading ? (
                      <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando contas de anúncio…</p>
                    ) : metaAdAccounts.length === 0 ? (
                      <p className="text-xs text-amber-400">Nenhuma conta encontrada com o token da agência. Verifique o acesso no Business Manager ou digite o ID manualmente.</p>
                    ) : (
                      <div ref={acctPickerRef} className="relative">
                        <button type="button" onClick={() => setAcctPickerOpen(v => !v)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm bg-[#1a1230] border rounded-lg text-left focus:outline-none transition-all"
                          style={{ borderColor: acctPickerOpen ? '#6a11cb' : '#2d2550' }}
                        >
                          <span className={`truncate ${selectedAdAccount ? 'text-white' : 'text-slate-500'}`}>
                            {selectedAdAccount ? `${selectedAdAccount.name} (${selectedAdAccount.id})` : 'Selecione uma conta…'}
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform ${acctPickerOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {acctPickerOpen && (
                          <div className="absolute top-full left-0 mt-1.5 w-full rounded-xl border border-[#2d2550] shadow-2xl z-[200] overflow-hidden"
                            style={{ background: '#0d0a1f' }}
                          >
                            <div className="px-3 pt-2.5 pb-2 border-b border-[#1e1635]">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                                <input
                                  autoFocus
                                  value={acctSearch}
                                  onChange={e => setAcctSearch(e.target.value)}
                                  placeholder="Buscar por nome ou ID..."
                                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                              {filteredAdAccounts.length === 0 ? (
                                <p className="text-xs text-slate-500 text-center py-6">Nenhum resultado para "{acctSearch}"</p>
                              ) : (
                                filteredAdAccounts.map(a => (
                                  <button key={a.id} type="button"
                                    onClick={() => { setMetaAdAccountId(a.id); setAcctPickerOpen(false); setAcctSearch('') }}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-white/[0.04] transition-colors"
                                    style={a.id === metaAdAccountId ? { background: 'rgba(106,17,203,0.1)' } : {}}
                                  >
                                    <span className="truncate text-slate-200">{a.name} <span className="text-slate-500">({a.id})</span></span>
                                    {a.account_status !== 1 && <span className="text-[10px] text-amber-400 flex-shrink-0">inativa</span>}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-3 border-t border-[#1e1635] space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Script de rastreamento</p>
                    <button onClick={() => { navigator.clipboard.writeText(trackerScript); toast.success('Script copiado!') }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#6a11cb] transition-colors"
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                  </div>
                  <div className="bg-[#080612] border border-[#1e1635] rounded-lg p-3 overflow-x-auto">
                    <code className="text-xs text-[#8b5cf6] whitespace-pre">{trackerScript}</code>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1e1635] space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-green-400" />
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Webhook WhatsApp (CTWA)</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Registre esta URL no Meta Business Manager → WhatsApp → Configuração → Webhooks para capturar o <code className="text-green-400 bg-green-400/10 px-1 rounded">ctwa_clid</code> dos anúncios Click-to-WhatsApp.
                  </p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={webhookUrl}
                      className="flex-1 px-3 py-2 text-xs bg-[#1a1230] border border-green-500/20 rounded-lg text-green-300 font-mono"
                    />
                    <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada!') }}
                      className="px-3 py-2 rounded-lg border border-[#2d2550] text-slate-400 hover:text-green-400 hover:border-green-500/40 transition-all flex-shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Token de verificação: defina <code className="text-slate-400">WHATSAPP_WEBHOOK_TOKEN</code> nas variáveis de ambiente e use o mesmo valor no Meta.
                  </p>
                </div>

                <SaveBtn />
              </div>
            )}

            {/* ─── Google Ads ─── */}
            {tab === 'google' && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Google Ads</h2>
                  <p className="text-xs text-slate-500 mt-1">Customer ID para sincronização de campanhas e conversões.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Customer ID</label>
                  <input value={googleAdsCustomerId} onChange={e => setGoogleAdsCustomerId(e.target.value)}
                    placeholder="Ex: 123-456-7890"
                    className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Refresh Token</label>
                  <div className="relative">
                    <input type={showGToken ? 'text' : 'password'}
                      placeholder="ya29.xxxxx..."
                      className="w-full px-3 py-2.5 pr-10 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                    />
                    <button type="button" onClick={() => setShowGToken(!showGToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showGToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <SaveBtn />
              </div>
            )}

            {/* ─── Google Local Service Ads ─── */}
            {tab === 'google' && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Google Local Service Ads</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    ID da conta de Local Services (diferente do Customer ID do Google Ads acima). Reaproveita as mesmas credenciais OAuth do Google Ads configuradas por trás — só habilite pra clientes que realmente contratam Local Services.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Account ID</label>
                  <input value={localServicesAccountId} onChange={e => setLocalServicesAccountId(e.target.value)}
                    placeholder="Ex: 1669536458"
                    className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                  />
                </div>
                <SaveBtn />
              </div>
            )}

            {/* ─── CRM (estágios do pipeline) ─── */}
            {tab === 'crm' && (
              <div className="glass rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Estágios do Pipeline</h2>
                    <p className="text-xs text-slate-500 mt-1">Configure os estágios e gatilhos de eventos CAPI do CRM deste cliente.</p>
                  </div>
                  <button
                    onClick={() => setStages(prev => [...prev, {
                      id: `new-${Date.now()}`, name: 'Novo Estágio',
                      color: '#6a11cb', order: prev.length, triggerCapiEvent: 'none',
                    }])}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-all"
                    style={{ background: '#6a11cb' }}>
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
                <div className="space-y-2">
                  {stages.map(stage => (
                    <div key={stage.id} className="flex items-center gap-3 p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                      <div className="flex gap-1 flex-shrink-0 flex-wrap max-w-[100px]">
                        {STAGE_COLORS.map(c => (
                          <button key={c}
                            onClick={() => setStages(prev => prev.map(s => s.id === stage.id ? { ...s, color: c } : s))}
                            className={`w-3.5 h-3.5 rounded-full transition-all ${stage.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0f0b1e] scale-110' : 'opacity-50 hover:opacity-100'}`}
                            style={{ background: c }} />
                        ))}
                      </div>
                      <input
                        value={stage.name}
                        onChange={e => setStages(prev => prev.map(s => s.id === stage.id ? { ...s, name: e.target.value } : s))}
                        className="flex-1 text-sm bg-transparent text-white focus:outline-none border-b border-transparent focus:border-[#6a11cb] transition-colors min-w-0" />
                      <select
                        value={stage.triggerCapiEvent}
                        onChange={e => setStages(prev => prev.map(s => s.id === stage.id ? { ...s, triggerCapiEvent: e.target.value } : s))}
                        className="text-xs bg-[#1e1635] border border-[#2d2550] text-slate-300 rounded-lg px-2 py-1 focus:outline-none flex-shrink-0">
                        <option value="none">Sem evento</option>
                        <option value="lead">Lead event</option>
                        <option value="qualified_lead">Lead Qualificado</option>
                        <option value="purchase">Purchase event</option>
                      </select>
                      <button onClick={() => deleteStage(stage.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {stages.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">Nenhum estágio configurado.</p>
                  )}
                </div>
                <button onClick={saveStages} disabled={savingStages}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
                  style={{ background: '#6a11cb', color: '#fff' }}>
                  {savingStages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            )}

            {/* ─── Produtos ─── */}
            {tab === 'produtos' && (
              <div className="glass rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Produtos / Serviços</h2>
                    <p className="text-xs text-slate-500 mt-1">Produtos vendidos e seus tickets — usados no popup de venda do Pipeline.</p>
                  </div>
                  <button
                    onClick={() => setProducts(prev => [...prev, {
                      id: `new-${Date.now()}`, name: 'Novo Produto',
                      price: 0, currency: 'BRL', description: '',
                    }])}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-all"
                    style={{ background: '#6a11cb' }}>
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
                <div className="space-y-2">
                  {products.map(product => (
                    <div key={product.id} className="flex items-center gap-2 p-3 bg-[#0f0b1e] rounded-xl border border-[#1e1635]">
                      <input
                        value={product.name}
                        placeholder="Nome do produto"
                        onChange={e => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, name: e.target.value } : p))}
                        className="flex-1 text-sm bg-transparent text-white placeholder-slate-600 focus:outline-none border-b border-transparent focus:border-[#6a11cb] transition-colors min-w-0" />
                      <input
                        value={product.description}
                        placeholder="Descrição (opcional)"
                        onChange={e => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, description: e.target.value } : p))}
                        className="flex-1 text-xs bg-transparent text-slate-400 placeholder-slate-600 focus:outline-none border-b border-transparent focus:border-[#6a11cb] transition-colors min-w-0" />
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
                      <button onClick={() => deleteProductRow(product.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {products.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">Nenhum produto configurado.</p>
                  )}
                </div>
                <button onClick={saveProductsList} disabled={savingProducts}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
                  style={{ background: '#6a11cb', color: '#fff' }}>
                  {savingProducts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            )}

            {/* ─── Rastreio ─── */}
            {tab === 'rastreio' && (
              <div className="space-y-4">
                <div className="glass rounded-2xl p-5 space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Número do WhatsApp</h2>
                    <p className="text-xs text-slate-500 mt-1">Com DDI (ex: 5511999999999) — usado para gerar os links wa.me abaixo.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)}
                      placeholder="5511999999999"
                      className="flex-1 px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all" />
                    <button onClick={saveWhatsappNumber} disabled={savingWhatsappNumber}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
                      style={{ background: '#6a11cb' }}>
                      {savingWhatsappNumber ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input value={newPhrase} onChange={e => setNewPhrase(e.target.value)} placeholder="Frase (ex: Vim do site)"
                      className="px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors" />
                    <input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="Origem (ex: Google, Site)"
                      className="px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors" />
                    <div className="flex gap-2">
                      <input value={newCampaign} onChange={e => setNewCampaign(e.target.value)} placeholder="Campanha (opcional)"
                        className="flex-1 px-3 py-2.5 text-sm bg-[#1e1635] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors" />
                      <button onClick={addPhrase} disabled={addingPhrase}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
                        style={{ background: '#6a11cb' }}>
                        {addingPhrase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

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
                              <button onClick={() => deletePhrase(p.id)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
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
              </div>
            )}

            {/* ─── WhatsApp ─── */}
            {tab === 'whatsapp' && (
              <div className="space-y-4">
                {/* Linked status */}
                {linkedInstance && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-4 py-3 rounded-xl">
                    <Wifi className="w-4 h-4 flex-shrink-0" />
                    Instância vinculada: <span className="font-semibold ml-1">{linkedInstance}</span>
                  </div>
                )}

                {/* Webhook — ver/ativar */}
                {linkedInstance && (
                  <div className="glass rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Webhook className="w-4 h-4 text-[#8b5cf6]" /> Webhook (recebimento de mensagens)
                      </h2>
                      <button onClick={loadWebhookStatus} disabled={webhookLoading}
                        className="text-slate-500 hover:text-white disabled:opacity-40 transition-colors flex-shrink-0" title="Verificar novamente">
                        <RefreshCw className={`w-3.5 h-3.5 ${webhookLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {webhookLoading && !webhookStatus ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando...
                      </div>
                    ) : webhookStatus?.isPointingHere ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-lg">
                        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> Apontado para este sistema — mensagens devem chegar em Conversas.
                      </div>
                    ) : webhookStatus?.configured ? (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>Apontado para outro destino ainda: <code className="text-[11px] break-all">{webhookStatus.currentUrl}</code></span>
                        </div>
                        <button onClick={handleActivateWebhook} disabled={webhookActivating}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
                          style={{ background: '#6a11cb', boxShadow: '0 4px 16px rgba(106,17,203,0.3)' }}>
                          {webhookActivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
                          Ativar Webhook (redireciona pra cá)
                        </button>
                      </div>
                    ) : webhookStatus ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0f0b1e] border border-[#1e1635] px-3 py-2 rounded-lg">
                          Nenhum webhook configurado ainda nessa instância.
                        </div>
                        <button onClick={handleActivateWebhook} disabled={webhookActivating}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
                          style={{ background: '#6a11cb', boxShadow: '0 4px 16px rgba(106,17,203,0.3)' }}>
                          {webhookActivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
                          Ativar Webhook
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Toggle existing / new */}
                <div className="flex gap-1 p-1 bg-[#0f0b1e] rounded-xl border border-[#1e1635] w-fit">
                  {[{ id: 'existing', label: 'Usar instância existente' }, { id: 'new', label: 'Criar nova instância' }].map(opt => (
                    <button key={opt.id} onClick={() => setWaTab(opt.id as 'existing' | 'new')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${waTab === opt.id ? 'gradient-brand text-white' : 'text-slate-400 hover:text-white'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Existing instances */}
                {waTab === 'existing' && (
                  <div className="glass rounded-2xl p-5 space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-green-400" /> Instâncias disponíveis
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">Selecione uma instância já conectada para vincular a este cliente.</p>
                    </div>

                    {!instancesLoaded ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando instâncias...
                      </div>
                    ) : instances.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4">
                        Nenhuma instância encontrada. Verifique a configuração da UazAPI nas configurações da agência.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {instances.map(inst => {
                          const isConnected = ['connected', 'open', 'CONNECTED'].includes(inst.status)
                          const isSelected = selectedInstance === inst.name || selectedInstance === inst.token
                          return (
                            <button key={inst.token || inst.name}
                              onClick={() => setSelectedInstance(isSelected ? '' : (inst.name || inst.token))}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                isSelected ? 'border-[#6a11cb]/60 bg-[#6a11cb]/8' : 'border-[#1e1635] hover:border-[#2d2550]'
                              }`}
                            >
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{inst.name || inst.token}</p>
                                <p className="text-[10px] text-slate-500">{isConnected ? 'Conectado' : inst.status}</p>
                              </div>
                              {isSelected && <CheckCircle className="w-4 h-4 text-[#8b5cf6] flex-shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <button onClick={handleLinkInstance} disabled={waSaving || !selectedInstance}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
                      style={{ background: '#6a11cb', boxShadow: '0 4px 16px rgba(106,17,203,0.3)' }}
                    >
                      {waSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                      Vincular instância selecionada
                    </button>
                  </div>
                )}

                {/* Create new instance */}
                {waTab === 'new' && (
                  <div className="glass rounded-2xl p-5 space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-green-400" /> Criar nova instância
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">Cria uma nova instância na UazAPI e vincula automaticamente a este cliente.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Nome da instância</label>
                      <input value={newInstanceName} onChange={e => setNewInstanceName(e.target.value)}
                        placeholder={`Ex: ${client?.name?.toLowerCase().replace(/\s+/g, '-') ?? 'cliente'}`}
                        className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-all"
                      />
                      <p className="text-[11px] text-slate-600">Use apenas letras, números e hífens. Sem espaços.</p>
                    </div>
                    <button onClick={handleCreateAndLink} disabled={waSaving || !newInstanceName.trim()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
                      style={{ background: '#6a11cb', boxShadow: '0 4px 16px rgba(106,17,203,0.3)' }}
                    >
                      {waSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Criar e vincular
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─── Acesso ─── */}
            {tab === 'acesso' && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="glass rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-white">Usuários com acesso</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Gerencie quem acessa o workspace deste cliente.</p>
                      </div>
                      <button
                        onClick={() => setAddForm(f => ({ ...f, show: !f.show }))}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                        style={{ background: '#6a11cb', boxShadow: '0 4px 12px rgba(106,17,203,0.3)' }}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Adicionar acesso
                      </button>
                    </div>

                    {/* Add form */}
                    {addForm.show && (
                      <div className="bg-[#0a0718] border border-[#2d2550] rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-300">Novo usuário</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Nome</label>
                            <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Nome completo"
                              className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">E-mail</label>
                            <input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                              placeholder="email@empresa.com" type="email"
                              className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Senha inicial</label>
                            <div className="relative">
                              <input type={addForm.showPass ? 'text' : 'password'} value={addForm.password}
                                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                                placeholder="Mínimo 6 caracteres"
                                className="w-full px-3 py-2 pr-8 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]"
                              />
                              <button type="button" onClick={() => setAddForm(f => ({ ...f, showPass: !f.showPass }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                                {addForm.showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500">Permissão</label>
                            <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                              className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-300 focus:outline-none focus:border-[#6a11cb]"
                            >
                              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={handleAddMember} disabled={addLoading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: '#6a11cb' }}
                          >
                            {addLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                            Criar acesso
                          </button>
                          <button onClick={() => setAddForm(f => ({ ...f, show: false }))}
                            className="px-4 py-2 rounded-lg text-xs text-slate-400 border border-[#2d2550] hover:border-[#6a11cb]/40 transition-all"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Members list */}
                    {!membersLoaded ? (
                      <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                      </div>
                    ) : members.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">Nenhum usuário cadastrado.</p>
                    ) : (
                      <div className="space-y-2">
                        {members.map(m => {
                          const rst = resetStates[m.userId] ?? { pass: '', show: false, saving: false }
                          return (
                            <div key={m.userId} className="border border-[#1e1635] rounded-xl overflow-hidden">
                              <div className="flex items-center gap-3 px-4 py-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}
                                >
                                  {m.name?.[0]?.toUpperCase() ?? '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{m.name}</p>
                                  <p className="text-[10px] text-slate-500 truncate">{m.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    <select
                                      value={m.role}
                                      onChange={e => handleRoleChange(m.userId, e.target.value)}
                                      className="appearance-none pl-2 pr-6 py-1 rounded-lg text-[11px] font-semibold border focus:outline-none focus:border-[#6a11cb] cursor-pointer"
                                      style={{
                                        background: `${roleColor(m.role)}18`,
                                        borderColor: `${roleColor(m.role)}40`,
                                        color: roleColor(m.role),
                                      }}
                                    >
                                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                    </select>
                                    <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: roleColor(m.role) }} />
                                  </div>
                                  <button
                                    onClick={() => setResetStates(prev => ({
                                      ...prev,
                                      [m.userId]: { ...(prev[m.userId] ?? { pass: '', saving: false }), show: !rst.show },
                                    }))}
                                    title="Redefinir senha"
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2d2550] text-slate-500 hover:text-[#6a11cb] hover:border-[#6a11cb]/50 transition-all"
                                  >
                                    <Key className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveMember(m.userId)}
                                    title="Remover acesso"
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2d2550] text-slate-500 hover:text-red-400 hover:border-red-400/40 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              {rst.show && (
                                <div className="px-4 pb-3 border-t border-[#1e1635] pt-3 flex gap-2">
                                  <div className="relative flex-1">
                                    <input
                                      type={rst.show ? 'text' : 'password'}
                                      value={rst.pass}
                                      onChange={e => setResetStates(prev => ({ ...prev, [m.userId]: { ...prev[m.userId], pass: e.target.value } }))}
                                      placeholder="Nova senha..."
                                      className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]"
                                    />
                                  </div>
                                  <button onClick={() => handleResetPassword(m.userId)} disabled={rst.saving}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                                    style={{ background: '#6a11cb' }}
                                  >
                                    {rst.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    Salvar
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Login link */}
                  <div className="glass rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-400">Link de acesso ao portal</p>
                    <div className="flex gap-2">
                      <input readOnly value={`${origin}/login`}
                        className="flex-1 px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-400 font-mono"
                      />
                      <button onClick={() => { navigator.clipboard.writeText(`${origin}/login`); toast.success('Link copiado!') }}
                        className="px-3 py-2 rounded-lg border border-[#2d2550] text-slate-400 hover:text-[#6a11cb] hover:border-[#6a11cb]/50 transition-all"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600">Envie este link junto com o e-mail e senha criados acima.</p>
                  </div>
                </div>
            )}

          </div>
        </main>
      </div>
    </>
  )
}
