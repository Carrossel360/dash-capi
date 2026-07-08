'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Users, Zap, Settings2, X, Eye, EyeOff,
  Loader2, CheckCircle, Building2, TrendingUp, BarChart2, Share2, MapPin, Star,
  DollarSign, Trash2, AlertTriangle,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

const PLANS = [
  { id: 'starter', label: 'Starter' },
  { id: 'pro', label: 'Pro' },
  { id: 'agency', label: 'Agency' },
]
const PLAN_COLOR: Record<string, string> = {
  starter: '#6a11cb',
  pro: '#8b5cf6',
  agency: '#F5A314',
}
const SEGMENTS = ['Estética', 'Jurídico', 'Academia', 'Imobiliário', 'Saúde', 'Educação', 'E-commerce', 'Outros']

const SERVICES = [
  { key: 'svcMetaAds', label: 'Meta Ads', icon: TrendingUp },
  { key: 'svcGoogleAds', label: 'Google Ads', icon: BarChart2 },
  { key: 'svcSocialMedia', label: 'Social Media', icon: Share2 },
  { key: 'svcGoogleBusiness', label: 'Google Business Profile', icon: MapPin },
  { key: 'svcGoogleLocal', label: 'Google Local Service', icon: Star },
]

interface Client {
  id: string; name: string; slug: string; segment: string | null
  plan: string; metaPixelId: string | null; metaAccessToken: string | null
  googleAdsCustomerId: string | null; createdAt: string
  leadsCount: number; eventsCount: number
  members: { id: string; role: string; user: { id: string; name: string; email: string } }[]
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function NovoCLienteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({
    name: '', segment: '', plan: 'starter',
    currency: 'BRL',
    loginEmail: '', loginPassword: '',
    svcMetaAds: false,
    svcGoogleAds: false,
    svcSocialMedia: false,
    svcGoogleBusiness: false,
    svcGoogleLocal: false,
  })

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name || !form.loginEmail || !form.loginPassword) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Cliente "${form.name}" criado!`)
      onCreated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-lg shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-white">Novo Cliente</h2>
            <p className="text-xs text-slate-500 mt-0.5">Cadastre um novo cliente na plataforma</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Nome do cliente *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex: Clínica Estética Silva"
              className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#F5A314] transition-all"
            />
          </div>

          {/* Segmento + Plano */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Segmento</label>
              <select value={form.segment} onChange={e => set('segment', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-300 focus:outline-none focus:border-[#F5A314]"
              >
                <option value="">Selecionar...</option>
                {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Plano</label>
              <select value={form.plan} onChange={e => set('plan', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-slate-300 focus:outline-none focus:border-[#F5A314]"
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
                { id: 'BRL', label: 'R$ Real Brasileiro', flag: '🇧🇷' },
                { id: 'USD', label: 'US$ Dólar Americano', flag: '🇺🇸' },
              ].map(c => (
                <button key={c.id} onClick={() => set('currency', c.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    form.currency === c.id
                      ? 'border-[#F5A314] bg-[#F5A314]/10 text-white'
                      : 'border-[#2d2550] text-slate-400 hover:border-[#2d2550]'
                  }`}
                >
                  <span>{c.flag}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Serviços */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Serviços contratados</label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICES.map(({ key, label, icon: Icon }) => {
                const active = form[key as keyof typeof form] as boolean
                return (
                  <button key={key} onClick={() => set(key, !active)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-left ${
                      active
                        ? 'border-[#6a11cb] bg-[#6a11cb]/10 text-white'
                        : 'border-[#2d2550] text-slate-500 hover:border-[#2d2550]/80'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                      active ? 'bg-[#6a11cb]' : 'bg-[#1a1230] border border-[#2d2550]'
                    }`}>
                      {active && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: active ? '#8b5cf6' : '#475569' }} />
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-[#1e1635] pt-4">
            <p className="text-xs font-semibold text-slate-400 mb-3">Acesso do cliente ao portal</p>

            <div className="space-y-1.5 mb-3">
              <label className="text-xs font-medium text-slate-400">E-mail de login *</label>
              <input type="email" value={form.loginEmail} onChange={e => set('loginEmail', e.target.value)}
                placeholder="cliente@empresa.com"
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#F5A314] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Senha de acesso *</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.loginPassword}
                  onChange={e => set('loginPassword', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#F5A314] transition-all"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#2d2550] text-slate-400 text-sm hover:text-white transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: '#F5A314', color: '#06040f' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'Criando...' : 'Criar cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ client, onClose, onDeleted }: {
  client: Client; onClose: () => void; onDeleted: () => void
}) {
  const { token } = useAuthStore()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Erro ao excluir')
        return
      }
      toast.success(`"${client.name}" excluído`)
      onDeleted()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-sm shadow-2xl z-10"
        style={{ background: '#0d0a1f', border: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="flex flex-col items-center text-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Excluir cliente?</h3>
            <p className="text-xs text-slate-400 mt-1">
              Todos os dados de <span className="text-white font-semibold">{client.name}</span> serão permanentemente removidos, incluindo leads, eventos e relatórios.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#2d2550] text-slate-400 text-xs hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const { token } = useAuthStore()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)

  async function loadClients() {
    try {
      const res = await fetch('/api/clients', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setClients(data.clients ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClients() }, [token])

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.segment ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      {showModal && <NovoCLienteModal onClose={() => setShowModal(false)} onCreated={loadClients} />}
      {deleteTarget && <DeleteConfirmModal client={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={loadClients} />}
      <Toaster position="top-right" toastOptions={{ style: { background: '#0f0b1e', color: '#e2e8f0', border: '1px solid #2d2550', borderRadius: '10px', fontSize: '13px' } }} />

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Clientes" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Clientes ativos', value: clients.length, icon: Building2, color: '#F5A314' },
              { label: 'Total de leads', value: clients.reduce((a, c) => a + c.leadsCount, 0), icon: Users, color: '#8b5cf6' },
              { label: 'Eventos CAPI', value: clients.reduce((a, c) => a + c.eventsCount, 0), icon: Zap, color: '#6a11cb' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{loading ? '—' : value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Search + New */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-[#1e1635] border border-[#2d2550] rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[#F5A314] transition-all"
              />
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-all"
              style={{ background: '#6a11cb', color: '#fff', boxShadow: '0 4px 16px rgba(106,17,203,0.3)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Cliente
            </button>
          </div>

          {/* Client list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#6a11cb' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">Nenhum cliente cadastrado ainda</p>
              <button onClick={() => setShowModal(true)} className="mt-4 text-xs hover:underline" style={{ color: '#6a11cb' }}>
                Criar o primeiro cliente →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((client) => {
                const planColor = PLAN_COLOR[client.plan] ?? PLAN_COLOR.starter
                const clientUser = client.members.find(m => m.role === 'viewer')
                return (
                  <div key={client.id} className="glass rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}
                        >
                          {getInitials(client.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">{client.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ color: planColor, background: `${planColor}18` }}
                            >
                              {PLANS.find(p => p.id === client.plan)?.label ?? client.plan}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {client.segment && <span className="text-xs text-slate-500">{client.segment}</span>}
                            {clientUser && (
                              <>
                                <span className="text-slate-700">·</span>
                                <span className="text-xs text-slate-500">{clientUser.user.email}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-4 text-center">
                          <div>
                            <p className="text-sm font-bold text-white">{client.leadsCount}</p>
                            <p className="text-[10px] text-slate-500">leads</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{client.eventsCount}</p>
                            <p className="text-[10px] text-slate-500">eventos</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${client.metaPixelId ? 'bg-[#1877f2]/10' : 'text-slate-600 bg-[#1e1635]'}`}
                            style={client.metaPixelId ? { color: '#6a11cb' } : {}}>
                            Meta {client.metaPixelId ? '✓' : '—'}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${client.googleAdsCustomerId ? 'text-[#8b5cf6] bg-[#8b5cf6]/10' : 'text-slate-600 bg-[#1e1635]'}`}>
                            Google {client.googleAdsCustomerId ? '✓' : '—'}
                          </span>
                        </div>

                        <button
                          onClick={() => router.push(`/clientes/${client.id}`)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#2d2550] text-slate-400 hover:text-white hover:border-[#6a11cb] transition-all"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Configurar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(client)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#2d2550] text-slate-600 hover:text-red-400 hover:border-red-400/40 transition-all"
                          title="Excluir cliente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </main>
      </div>
    </>
  )
}
