'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners, DragOverlay,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Phone, Mail, GripVertical, Loader2, X, Check,
  Clock, Globe, Trash2, ShoppingBag, DollarSign, Calendar, MessageCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

// ── Types ────────────────────────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  color: string
  triggerCapiEvent: string
  order: number
}

interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  utmSource: string | null
  utmMedium: string | null
  notes: string | null
  dealValue: number | null
  tags: string[]
  ctwaClid: string | null
  metadata: { metaAdId?: string; adHeadline?: string } | null
  pipelineStageId: string
  createdAt: string
}

interface Product {
  id: string
  name: string
  price: number
  currency: string
}

type Period = 'all' | '7d' | '30d' | '90d' | 'today'

const PERIOD_OPTS: { value: Period; label: string }[] = [
  { value: 'all',   label: 'Todos' },
  { value: 'today', label: 'Hoje' },
  { value: '7d',    label: '7 dias' },
  { value: '30d',   label: '30 dias' },
  { value: '90d',   label: '90 dias' },
]

function periodFrom(p: Period): Date | null {
  if (p === 'all') return null
  const d = new Date()
  if (p === 'today') { d.setHours(0, 0, 0, 0); return d }
  const days = p === '7d' ? 7 : p === '30d' ? 30 : 90
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Deal popup ────────────────────────────────────────────────────────────────

function DealPopup({ lead, stageId, products, currency, token, onConfirm, onCancel }: {
  lead: Lead
  stageId: string
  products: Product[]
  currency: string
  token: string
  onConfirm: (lead: Lead, stageId: string, value: number) => void
  onCancel: () => void
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [value, setValue] = useState(String(products[0]?.price ?? ''))
  const [saving, setSaving] = useState(false)

  const cs = currency === 'USD' ? 'US$' : 'R$'

  async function handleConfirm() {
    setSaving(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ leadId: lead.id, productId: productId || null, value: parseFloat(value) || 0, stageId }),
      })
      if (!res.ok) throw new Error()
      onConfirm({ ...lead, pipelineStageId: stageId, dealValue: parseFloat(value) || 0 }, stageId, parseFloat(value) || 0)
      toast.success('Venda registrada!')
    } catch {
      toast.error('Erro ao registrar venda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative rounded-2xl p-6 w-full max-w-sm shadow-2xl z-10"
        style={{ background: '#0d0a1f', border: '1px solid rgba(16,185,129,0.3)' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Registrar Venda</h3>
            <p className="text-xs text-slate-500">{lead.name}</p>
          </div>
        </div>

        <div className="space-y-3">
          {products.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Produto</label>
              <select
                value={productId}
                onChange={e => {
                  setProductId(e.target.value)
                  const p = products.find(p => p.id === e.target.value)
                  if (p) setValue(String(p.price))
                }}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Sem produto específico</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {cs} {p.price.toLocaleString('pt-BR')}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Valor da venda ({cs})</label>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0,00"
              className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-[#2d2550] text-slate-400 text-xs hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
            style={{ background: '#10b981', color: '#fff' }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Salvando...' : 'Confirmar Venda'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Modal ────────────────────────────────────────────────────────────────

function LeadModal({ lead, stages, products, token, onClose, onSaved, onDeleted }: {
  lead: Lead
  stages: Stage[]
  products: Product[]
  token: string
  onClose: () => void
  onSaved: (lead: Lead) => void
  onDeleted: (id: string) => void
}) {
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    notes: lead.notes ?? '',
    source: lead.source ?? '',
    pipelineStageId: lead.pipelineStageId,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onSaved({ ...lead, ...form, ...updated })
      toast.success('Lead atualizado')
      onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir "${lead.name}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      onDeleted(lead.id)
      toast.success('Lead excluído')
      onClose()
    } catch {
      toast.error('Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }

  const createdAt = new Date(lead.createdAt)
  const dateStr = createdAt.toLocaleDateString('pt-BR')
  const timeStr = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1635]">
          <h2 className="text-sm font-bold text-white">Detalhes do Lead</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Nome + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Nome</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Status</label>
              <select value={form.pipelineStageId} onChange={e => set('pipelineStageId', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Produto + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Tipo de Cliente</label>
              <select value={form.source} onChange={e => set('source', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
                <option value="">Selecione...</option>
                {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
          </div>

          {/* Telefone + Observações */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Observações</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                placeholder="Adicione observações sobre este lead..."
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] resize-none" />
            </div>
          </div>

          {/* Entrada no Pipeline */}
          <div className="rounded-xl p-4 border border-[#1e1635] bg-[#0a0818] flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-400">Entrada no Pipeline</p>
              <p className="text-sm text-white mt-0.5">{dateStr} às {timeStr}</p>
            </div>
          </div>

          {/* UTM */}
          {(lead.utmSource || lead.utmMedium) && (
            <div className="rounded-xl p-4 border border-[#1e1635] bg-[#0a0818]">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-slate-500" />
                <p className="text-xs font-semibold text-slate-400">Dados de Origem (UTM)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {lead.utmSource && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Source:</p>
                    <div className="px-3 py-2 bg-[#1a1230] rounded-lg text-sm text-slate-300">{lead.utmSource}</div>
                  </div>
                )}
                {lead.utmMedium && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Medium:</p>
                    <div className="px-3 py-2 bg-[#1a1230] rounded-lg text-sm text-slate-300">{lead.utmMedium}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CTWA attribution */}
          {lead.ctwaClid && (
            <div className="rounded-xl p-4 border border-green-500/20 bg-green-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-green-400">Atribuição WhatsApp (CTWA)</p>
              </div>
              {lead.metadata?.adHeadline && (
                <p className="text-xs text-white pl-6">{lead.metadata.adHeadline}</p>
              )}
              {lead.metadata?.metaAdId && (
                <div className="pl-6 flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">Ad ID:</span>
                  <span className="text-[10px] text-slate-400 font-mono">{lead.metadata.metaAdId}</span>
                </div>
              )}
              <p className="text-[10px] text-slate-600 pl-6 font-mono truncate">{lead.ctwaClid}</p>
            </div>
          )}

          {/* Deal value if exists */}
          {lead.dealValue && (
            <div className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
              <DollarSign className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-400">Venda registrada</p>
                <p className="text-sm text-white mt-0.5">
                  R$ {lead.dealValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1e1635]">
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Excluir Lead
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#2d2550] text-slate-400 text-xs hover:text-white transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-all"
              style={{ background: '#6a11cb', color: '#fff' }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, onClick, isDragging }: { lead: Lead; onClick: () => void; isDragging?: boolean }) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: lead.id })

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isSortableDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style}
      className={`glass rounded-lg p-3 space-y-2 cursor-pointer ${isDragging ? 'shadow-2xl rotate-1 scale-105' : 'card-hover'}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white leading-tight flex-1">{lead.name}</p>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {lead.phone && (
            <button
              onClick={e => { e.stopPropagation(); router.push(`/conversas?phone=${lead.phone!.replace(/\D/g, '')}`) }}
              className="text-slate-600 hover:text-green-400 transition-colors"
              title="Abrir conversa"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            {...attributes} {...listeners}
            onClick={e => e.stopPropagation()}
            className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {(lead.email || lead.phone) && (
        <div className="space-y-1">
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Mail className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[150px]">{lead.email}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        {lead.dealValue ? (
          <div className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <DollarSign className="w-3 h-3" />
            {lead.dealValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </div>
        ) : <span />}
        <div className="flex items-center gap-1">
          {lead.ctwaClid && (
            <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
              <MessageCircle className="w-2.5 h-2.5" />
              WA
            </span>
          )}
          {(lead.source || lead.utmSource) && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#1e1635] text-slate-400 truncate max-w-[80px]">
              {lead.source || lead.utmSource}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({ stage, leads, onCardClick }: { stage: Stage; leads: Lead[]; onCardClick: (lead: Lead) => void }) {
  const total = leads.reduce((s, l) => s + (l.dealValue ?? 0), 0)
  return (
    <div className="flex flex-col flex-shrink-0 w-64">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{stage.name}</span>
          <span className="text-xs text-slate-600 bg-[#1e1635] px-1.5 py-0.5 rounded-full">{leads.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {total > 0 && (
            <span className="text-xs text-emerald-400 font-medium">
              R$ {total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          )}
          {stage.triggerCapiEvent !== 'none' && (
            <span className="text-xs text-[#8b5cf6] bg-[#6a11cb]/10 border border-[#6a11cb]/20 px-1.5 py-0.5 rounded">
              CAPI
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 glass rounded-xl p-2 space-y-2 min-h-[200px]">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-slate-600">
            Nenhum lead
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { token, currentWorkspace } = useAuthStore()
  const currency = currentWorkspace?.currency ?? 'BRL'

  const [stages, setStages]   = useState<Stage[]>([])
  const [leads, setLeads]     = useState<Lead[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState<Period>('30d')
  const [activeId, setActiveId] = useState<string | null>(null)

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dealPending, setDealPending] = useState<{ lead: Lead; stageId: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const from = periodFrom(period)
      const q = from ? `?from=${from.toISOString()}` : ''
      const [stagesRes, leadsRes, productsRes] = await Promise.all([
        fetch('/api/stages',     { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/leads${q}`,  { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/products',   { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const stagesData  = await stagesRes.json()
      const leadsData   = await leadsRes.json()
      const productsData = await productsRes.json()
      setStages((Array.isArray(stagesData) ? stagesData : []).sort((a: Stage, b: Stage) => a.order - b.order))
      setLeads(Array.isArray(leadsData) ? leadsData : [])
      setProducts(productsData.products ?? [])
    } catch {
      toast.error('Erro ao carregar pipeline')
    } finally {
      setLoading(false)
    }
  }, [token, period])

  useEffect(() => { load() }, [load])

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const leadId = active.id as string
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return

    const targetLead = leads.find(l => l.id === over.id)
    const targetStageId = targetLead ? targetLead.pipelineStageId : (over.id as string)

    if (lead.pipelineStageId === targetStageId) return

    const targetStage = stages.find(s => s.id === targetStageId)

    // If moving to a purchase stage → show deal popup
    if (targetStage?.triggerCapiEvent === 'purchase') {
      setDealPending({ lead, stageId: targetStageId })
      return
    }

    // Otherwise move directly
    const prevLeads = [...leads]
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipelineStageId: targetStageId } : l))

    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stageId: targetStageId }),
      })
      if (!res.ok) throw new Error()
      if (targetStage?.triggerCapiEvent !== 'none') {
        toast.success(`Evento CAPI enfileirado 🎯`)
      }
    } catch {
      setLeads(prevLeads)
      toast.error('Erro ao mover lead')
    }
  }

  function handleDealConfirm(updatedLead: Lead) {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l))
    setDealPending(null)
  }

  function handleLeadSaved(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
  }

  function handleLeadDeleted(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null

  const totalLeads = leads.length
  const totalValue = leads.reduce((s, l) => s + (l.dealValue ?? 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Pipeline CRM" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <>
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          stages={stages}
          products={products}
          token={token!}
          onClose={() => setSelectedLead(null)}
          onSaved={handleLeadSaved}
          onDeleted={handleLeadDeleted}
        />
      )}

      {dealPending && (
        <DealPopup
          lead={dealPending.lead}
          stageId={dealPending.stageId}
          products={products}
          currency={currency}
          token={token!}
          onConfirm={handleDealConfirm}
          onCancel={() => setDealPending(null)}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Pipeline CRM" />
        <main className="flex-1 overflow-hidden p-5 flex flex-col gap-4">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>Período:</span>
              </div>
              <div className="flex gap-1">
                {PERIOD_OPTS.map(opt => (
                  <button key={opt.value} onClick={() => setPeriod(opt.value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={period === opt.value
                      ? { background: '#6a11cb', color: '#fff', boxShadow: '0 2px 12px rgba(106,17,203,0.4)' }
                      : { background: 'rgba(15,11,30,0.7)', color: '#94a3b8', border: '1px solid #1e1635' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-[#1e1635]" />
              <span className="text-xs text-slate-500">{totalLeads} leads</span>
              {totalValue > 0 && (
                <span className="text-xs text-emerald-400 font-medium">
                  R$ {totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em vendas
                </span>
              )}
            </div>

            <button className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
              <Plus className="w-3.5 h-3.5" />
              Novo Lead
            </button>
          </div>

          {/* Kanban */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={e => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}
            onDragOver={(_: DragOverEvent) => {}}
          >
            <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
              {stages.map(stage => (
                <Column
                  key={stage.id}
                  stage={stage}
                  leads={leads.filter(l => l.pipelineStageId === stage.id)}
                  onCardClick={setSelectedLead}
                />
              ))}
              {stages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-500">Nenhum estágio configurado.</p>
                </div>
              )}
            </div>
            <DragOverlay>
              {activeLead && <LeadCard lead={activeLead} onClick={() => {}} isDragging />}
            </DragOverlay>
          </DndContext>

        </main>
      </div>
    </>
  )
}
