'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, ChevronLeft, ChevronRight, Check, AlertTriangle, Search, Archive } from 'lucide-react'
import { CORE_SERVICES, EXTRA_SERVICES } from '@/lib/services-catalog'

const ALL_SERVICES = [...CORE_SERVICES, ...EXTRA_SERVICES]

interface ClientRow {
  id: string
  name: string
  segment: string | null
  isActive: boolean
  extraServices: string[]
  [key: string]: unknown // svcMetaAds, svcGoogleAds, ... (booleans vindos da API)
}

interface ClientState {
  workspaceId: string
  name: string
  segment: string | null
  isActive: boolean
  services: Record<string, boolean>
  extraServices: string[]
}

export default function ServicosCheckupPage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [clients, setClients] = useState<ClientState[]>([])
  const [index, setIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ saved: number; failed: number } | null>(null)

  useEffect(() => {
    fetch(`/api/public/services-checkup?token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => {
        const rows: ClientRow[] = d.clients ?? []
        setClients(rows.map(r => ({
          workspaceId: r.id,
          name: r.name,
          segment: r.segment,
          isActive: r.isActive ?? true,
          services: Object.fromEntries(CORE_SERVICES.map(s => [s.key, Boolean(r[s.key])])),
          extraServices: r.extraServices ?? [],
        })))
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false))
  }, [token])

  function toggleCore(key: string) {
    setClients(prev => prev.map((c, i) => i !== index ? c : { ...c, services: { ...c.services, [key]: !c.services[key] } }))
  }

  function toggleActive() {
    setClients(prev => prev.map((c, i) => i !== index ? c : { ...c, isActive: !c.isActive }))
  }

  function toggleExtra(key: string) {
    setClients(prev => prev.map((c, i) => {
      if (i !== index) return c
      const has = c.extraServices.includes(key)
      return { ...c, extraServices: has ? c.extraServices.filter(k => k !== key) : [...c.extraServices, key] }
    }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/services-checkup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          updates: clients.map(c => ({ workspaceId: c.workspaceId, services: c.services, extraServices: c.extraServices, isActive: c.isActive })),
        }),
      })
      const data = await res.json()
      if (res.ok) setResult({ saved: data.saved ?? clients.length, failed: (data.failed ?? []).length })
      else setInvalid(true)
    } catch {
      setInvalid(true)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredIndexes = search.trim()
    ? clients.map((c, i) => ({ c, i })).filter(({ c }) => c.name.toLowerCase().includes(search.toLowerCase())).map(({ i }) => i)
    : null

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#F5A314' }} />
          <p className="text-sm text-slate-400">Carregando clientes...</p>
        </div>
      </Shell>
    )
  }

  if (invalid) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-sm font-semibold text-white">Link inválido ou expirado</p>
          <p className="text-xs text-slate-500">Peça um novo link pra quem te enviou este.</p>
        </div>
      </Shell>
    )
  }

  if (result) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <Check className="w-7 h-7 text-emerald-400" />
          </div>
          <p className="text-base font-semibold text-white">Enviado com sucesso!</p>
          <p className="text-xs text-slate-500">
            {result.saved} {result.saved === 1 ? 'cliente atualizado' : 'clientes atualizados'}
            {result.failed > 0 && ` — ${result.failed} com erro, avise quem te enviou o link`}
          </p>
        </div>
      </Shell>
    )
  }

  const current = clients[index]
  if (!current) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
          <p className="text-sm text-slate-400">Nenhum cliente encontrado.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {/* Progress */}
      <div className="px-6 pt-5">
        <div className="mb-2">
          <p className="text-xs text-slate-500">Cliente {index + 1} de {clients.length}</p>
        </div>
        <div className="h-1 rounded-full bg-[#1e1635] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${((index + 1) / clients.length) * 100}%`, background: 'linear-gradient(90deg, #6a11cb, #F5A314)' }} />
        </div>
      </div>

      {/* Jump to client */}
      <div className="px-6 pt-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Ir direto pra um cliente..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
          />
        </div>
        {filteredIndexes && (
          <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-[#2d2550] bg-[#1a1230]">
            {filteredIndexes.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-3">Nenhum resultado</p>
            ) : filteredIndexes.map(i => (
              <button key={clients[i].workspaceId} onClick={() => { setIndex(i); setSearch('') }}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.04] transition-colors">
                {clients[i].name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Client name */}
      <div className="px-6 pt-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{current.name}</h2>
          {current.segment && <p className="text-xs text-slate-500">{current.segment}</p>}
        </div>
        <button
          onClick={toggleActive}
          title={current.isActive ? 'Marcar como cliente encerrado/arquivado' : 'Reativar cliente'}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border flex-shrink-0 transition-all"
          style={current.isActive
            ? { borderColor: '#2d2550', color: '#94a3b8' }
            : { background: 'rgba(239,68,68,0.12)', borderColor: '#ef4444', color: '#f87171' }}
        >
          <Archive className="w-3 h-3" />
          {current.isActive ? 'Ativo' : 'Arquivado'}
        </button>
      </div>

      {/* Services */}
      <div className="px-6 pt-4 pb-2 space-y-1.5 max-h-[45vh] overflow-y-auto">
        {ALL_SERVICES.map(s => {
          const isCore = CORE_SERVICES.some(c => c.key === s.key)
          const checked = isCore ? Boolean(current.services[s.key]) : current.extraServices.includes(s.key)
          return (
            <button
              key={s.key}
              onClick={() => isCore ? toggleCore(s.key) : toggleExtra(s.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all"
              style={checked
                ? { background: 'rgba(106,17,203,0.12)', borderColor: '#6a11cb' }
                : { background: '#0f0b1e', borderColor: '#1e1635' }}
            >
              <div className="rounded flex items-center justify-center flex-shrink-0 border"
                style={{ width: 18, height: 18, background: checked ? '#6a11cb' : 'transparent', borderColor: checked ? '#6a11cb' : '#2d2550' }}
              >
                {checked && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className={`text-sm ${checked ? 'text-white font-medium' : 'text-slate-400'}`}>{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Nav */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-[#1e1635] mt-2">
        <button
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-[#2d2550] text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white hover:border-[#6a11cb]/50 transition-all"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
        </button>

        {index < clients.length - 1 ? (
          <button
            onClick={() => setIndex(i => Math.min(clients.length - 1, i + 1))}
            className="flex items-center gap-1 text-xs px-4 py-2 rounded-lg font-semibold transition-all"
            style={{ background: '#6a11cb', color: '#fff' }}
          >
            Próximo <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 text-xs px-5 py-2 rounded-lg font-semibold transition-all disabled:opacity-60"
            style={{ background: '#F5A314', color: '#1a1230' }}
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Enviar
          </button>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#06040f' }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-5">
          <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">Sistema Orbital</p>
          <h1 className="text-lg font-black tracking-wider mt-0.5" style={{ color: '#F5A314' }}>CARROSSEL 360</h1>
          <p className="text-xs text-slate-500 mt-1">Checkup de serviços contratados</p>
        </div>
        <div className="rounded-2xl border border-[#2d2550] shadow-2xl overflow-hidden" style={{ background: '#0d0a1f' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
