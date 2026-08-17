'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent, CollisionDetection, DropAnimation,
  PointerSensor, useSensor, useSensors, pointerWithin, rectIntersection, DragOverlay, useDroppable,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Phone, Mail, GripVertical, Loader2, X, Check,
  Clock, Globe, Trash2, ShoppingBag, DollarSign, Calendar, MessageCircle, MessageSquare, Search, Upload, Download,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import { parseImportText } from '@/lib/lead-import-parser'

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
  clientType: string | null
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
  deals?: { id: string; value: number; product: { id: string; name: string } | null }[]
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

// Origem (campanha/plataforma) e canal (como a mensagem chegou) são dois badges separados —
// "Meta" fica sempre "Meta" independente de ter vindo por WhatsApp ou Formulário Nativo, o
// canal específico é quem entra no segundo badge (utmMedium). Cor reconhecida pelo texto (não
// por um enum fixo, já que ambos os campos são string livre vinda de vários lugares).
function sourceBadgeStyle(source: string): { bg: string; text: string; border: string } {
  const s = source.toLowerCase()
  if (s.includes('meta')) {
    return { bg: 'rgba(37,117,252,0.12)', text: '#60a5fa', border: 'rgba(37,117,252,0.3)' } // Meta — azul
  }
  if (s.includes('google') || s.includes('gbp')) {
    return { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.3)' } // Google/GBP — vermelho
  }
  // WhatsApp sem atribuição de campanha (mensagem manual, sem ctwa_clid) — mesma cor de
  // quando aparece como canal ao lado do Meta, pra manter "WhatsApp" sempre verde.
  if (s.includes('whatsapp')) {
    return { bg: 'rgba(16,185,129,0.12)', text: '#34d399', border: 'rgba(16,185,129,0.3)' }
  }
  return { bg: '#1e1635', text: '#94a3b8', border: 'transparent' }
}

function mediumBadgeStyle(medium: string): { bg: string; text: string; border: string } {
  const m = medium.toLowerCase()
  if (m.includes('whatsapp')) {
    return { bg: 'rgba(16,185,129,0.12)', text: '#34d399', border: 'rgba(16,185,129,0.3)' } // WhatsApp — verde
  }
  if (m.includes('formulário') || m.includes('formulario')) {
    return { bg: 'rgba(148,163,184,0.12)', text: '#cbd5e1', border: 'rgba(148,163,184,0.3)' } // Formulário Nativo — cinza
  }
  return { bg: '#1e1635', text: '#94a3b8', border: 'transparent' }
}

// Opções fixas do campo Origem — "Outro" cai pro campo de texto livre, pra continuar aceitando
// tanto valores que webhooks/importações já preenchem fora dessa lista (Google Ads, Site...)
// quanto uma origem manual quando não tem rastreamento automático.
const PREDEFINED_SOURCES = ['Meta', 'Google', 'GBP', 'Instagram', 'Orgânico']
const CLIENT_TYPES = ['Cliente Novo', 'Cliente Ativo', 'Cliente Recuperado', 'Visitante']

function OriginField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Leads antigos gravaram o texto literal "Indefinido" no campo source — trata igual a vazio
  // (opção padrão), não como um valor customizado que cairia em "Outro" sem necessidade.
  const isBlank = !value || value.trim().toLowerCase() === 'indefinido'
  const isKnown = PREDEFINED_SOURCES.includes(value)
  const [customMode, setCustomMode] = useState(!isKnown && !isBlank)

  useEffect(() => { if (isKnown || isBlank) setCustomMode(false) }, [isKnown, isBlank])

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">Origem</label>
      <select
        value={customMode ? '__outro__' : (isBlank ? '' : value)}
        onChange={e => {
          if (e.target.value === '__outro__') { setCustomMode(true); onChange('') }
          else { setCustomMode(false); onChange(e.target.value) }
        }}
        className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
        <option value="">Indefinido</option>
        {PREDEFINED_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        <option value="__outro__">Outro</option>
      </select>
      {customMode && (
        <input value={value} onChange={e => onChange(e.target.value)} autoFocus
          placeholder="Digite a origem..."
          className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb]" />
      )}
    </div>
  )
}

// ── Deal popup ────────────────────────────────────────────────────────────────

function DealPopup({ lead, stageId, products, currency, token, mode = 'create', onConfirm, onSkip, onCancel }: {
  lead: Lead
  stageId?: string
  products: Product[]
  currency: string
  token: string
  mode?: 'create' | 'edit'
  onConfirm: (lead: Lead) => void
  onSkip?: () => Promise<void>
  onCancel: () => void
}) {
  const existingDeals = lead.deals ?? []
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(existingDeals.filter(d => d.product).map(d => [d.product!.id, true]))
  )
  const [productValues, setProductValues] = useState<Record<string, string>>(
    Object.fromEntries(products.map(p => {
      const existing = existingDeals.find(d => d.product?.id === p.id)
      return [p.id, String(existing?.value ?? p.price)]
    }))
  )
  const [manualValue, setManualValue] = useState(
    String(existingDeals.find(d => !d.product)?.value ?? '')
  )
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)

  const cs = currency === 'USD' ? 'US$' : 'R$'

  // Tentei deixar esse popup acompanhando o tema (ao vivo, no navegador) em vez de sempre
  // escuro como os outros modais — mas mesmo com a matemática do filtro de inversão batendo
  // (branco autoral deveria voltar a branco depois das duas passagens), o Chrome não compõe
  // os dois filtros do jeito esperado aqui e renderiza tudo preto. Mantido travado no escuro
  // (.theme-locked-modal), igual todos os outros modais do app — comportamento já confiável.
  const t = {
    cardBg: '#0d0a1f',
    cardBorder: 'rgba(16,185,129,0.3)',
    iconBg: 'rgba(16,185,129,0.1)',
    title: '#fff',
    sub: '#64748b',
    close: '#64748b',
    label: '#94a3b8',
    intro: '#94a3b8',
    rowBg: '#1a1230',
    rowBorder: '#2d2550',
    rowText: '#e2e8f0',
    inputBg: '#0f0b1e',
    inputBorder: '#2d2550',
    inputText: '#fff',
    checkboxBorder: '#2d2550',
    divider: '#1e1635',
  }

  function toggleProduct(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const hasProductsSelected = Object.values(selected).some(Boolean)
  const total = hasProductsSelected
    ? products.reduce((s, p) => s + (selected[p.id] ? (parseFloat(productValues[p.id]) || 0) : 0), 0)
    : (parseFloat(manualValue) || 0)

  async function handleConfirm() {
    // Só bloqueia venda vazia no registro inicial (não faz sentido criar uma venda de R$0).
    // Na edição, reduzir a R$0 é uma correção válida (ex: excluir o único produto vendido) —
    // o servidor já ignora itens com valor 0 e simplesmente limpa a venda do lead.
    if (mode === 'create' && total <= 0) return
    setSaving(true)
    try {
      const items = hasProductsSelected
        ? products.filter(p => selected[p.id]).map(p => ({ productId: p.id, value: parseFloat(productValues[p.id]) || 0 }))
        : [{ productId: null, value: parseFloat(manualValue) || 0 }]
      const url = mode === 'edit' ? `/api/leads/${lead.id}/deal` : '/api/deals'
      const body = mode === 'edit'
        ? { items }
        : { leadId: lead.id, stageId, items }
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      onConfirm({
        ...lead,
        pipelineStageId: stageId ?? lead.pipelineStageId,
        dealValue: total,
        deals: items.map((it, i) => ({
          id: `local-${i}`,
          value: it.value,
          product: it.productId ? { id: it.productId, name: products.find(p => p.id === it.productId)?.name ?? '' } : null,
        })),
      })
      toast.success(mode === 'edit' ? 'Venda atualizada!' : 'Venda registrada!')
    } catch {
      toast.error('Erro ao salvar venda')
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    if (!onSkip) return
    setSkipping(true)
    try { await onSkip() } finally { setSkipping(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 theme-locked-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative rounded-2xl w-full max-w-sm shadow-2xl z-10"
        style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: t.iconBg }}>
              <ShoppingBag className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: t.title }}>{mode === 'edit' ? 'Editar Venda' : 'Registrar Venda'}</h3>
              <p className="text-xs" style={{ color: t.sub }}>{lead.name}</p>
            </div>
          </div>
          <button onClick={onCancel} className="hover:opacity-70 transition-opacity flex-shrink-0" style={{ color: t.close }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-6 pt-4 text-xs" style={{ color: t.intro }}>
          {mode === 'edit'
            ? 'Ajuste os produtos/serviços ou o valor dessa venda.'
            : 'Parabéns! Selecione os produtos ou serviços vendidos pra registrar o faturamento.'}
        </p>

        <div className="px-6 pt-4">
          {products.length > 0 && (
            <>
              <label className="text-xs font-medium" style={{ color: t.label }}>Produtos/Serviços</label>
              <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {products.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border" style={{ borderColor: t.rowBorder, background: t.rowBg }}>
                    <button type="button" onClick={() => toggleProduct(p.id)}
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all"
                      style={selected[p.id] ? { background: '#10b981', borderColor: '#10b981' } : { borderColor: t.checkboxBorder }}
                    >
                      {selected[p.id] && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="flex-1 text-xs truncate" style={{ color: t.rowText }}>{p.name}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: t.sub }}>{cs}</span>
                    <input type="number" value={productValues[p.id] ?? ''}
                      onChange={e => setProductValues(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-20 px-2 py-1 text-xs rounded border text-right focus:outline-none focus:border-emerald-500 flex-shrink-0"
                      style={{ background: t.inputBg, borderColor: t.inputBorder, color: t.inputText }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={products.length > 0 ? 'mt-4 pt-4 border-t' : ''} style={products.length > 0 ? { borderColor: t.divider } : undefined}>
            <label className="text-xs font-medium" style={{ color: t.label }}>
              {products.length > 0 ? 'OU Valor Manual (sem produto específico)' : `Valor da venda (${cs})`}
            </label>
            <div className="mt-1.5 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: t.sub }}>{cs}</span>
              <input type="number" value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                disabled={hasProductsSelected}
                placeholder="0,00"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                style={{ background: t.inputBg, borderColor: t.inputBorder, color: t.inputText }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-5 mt-2">
          {mode === 'create' && (
            <button onClick={handleSkip} disabled={skipping || saving}
              className="flex-1 py-2.5 rounded-lg border text-xs transition-colors disabled:opacity-50"
              style={{ borderColor: t.inputBorder, color: t.label }}>
              {skipping ? 'Movendo...' : 'Pular'}
            </button>
          )}
          {mode === 'edit' && (
            <button onClick={onCancel} disabled={saving}
              className="flex-1 py-2.5 rounded-lg border text-xs transition-colors disabled:opacity-50"
              style={{ borderColor: t.inputBorder, color: t.label }}>
              Cancelar
            </button>
          )}
          <button onClick={handleConfirm} disabled={saving || skipping || (mode === 'create' && total <= 0)}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all"
            style={{ background: '#10b981', color: '#fff' }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Salvando...' : mode === 'edit' ? 'Salvar Alterações' : 'Confirmar Venda'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Modal ────────────────────────────────────────────────────────────────

function LeadModal({ lead, stages, currency, token, onClose, onSaved, onDeleted, onRequestDeal, onRequestEditDeal }: {
  lead: Lead
  stages: Stage[]
  currency: string
  token: string
  onClose: () => void
  onSaved: (lead: Lead) => void
  onDeleted: (id: string) => void
  onRequestDeal: (lead: Lead, stageId: string) => void
  onRequestEditDeal: (lead: Lead) => void
}) {
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    clientType: lead.clientType ?? '',
    notes: lead.notes ?? '',
    source: lead.source ?? '',
    pipelineStageId: lead.pipelineStageId,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const cs = currency === 'USD' ? 'US$' : 'R$'

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      const movingToStage = form.pipelineStageId !== lead.pipelineStageId
      const targetStage = stages.find(s => s.id === form.pipelineStageId)

      // Mudar pra um estágio "de venda" precisa passar pelo popup de produto/valor
      // (mesmo caminho do drag-and-drop) em vez de mover direto sem registrar Deal.
      if (movingToStage && targetStage?.triggerCapiEvent === 'purchase') {
        const { pipelineStageId, ...rest } = form
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(rest),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || 'Erro ao salvar')
        }
        const updated = await res.json()
        onSaved({ ...lead, ...rest, ...updated })
        onRequestDeal({ ...lead, ...rest, ...updated }, form.pipelineStageId)
        return
      }

      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Erro ao salvar')
      }
      const updated = await res.json()
      onSaved({ ...lead, ...form, ...updated })
      toast.success('Lead atualizado')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar')
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
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 theme-locked-modal">
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

          {/* Tipo de cliente + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Tipo de Cliente</label>
              <select value={form.clientType} onChange={e => set('clientType', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
                <option value="">Selecione...</option>
                {CLIENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
          </div>

          <OriginField value={form.source} onChange={v => set('source', v)} />

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
          {lead.dealValue ? (
            <>
              <div className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3">
                <DollarSign className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-emerald-400">Detalhes da Venda</p>
                  <p className="text-sm text-white mt-0.5 font-semibold">
                    {cs} {lead.dealValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  {(lead.deals ?? []).some(d => d.product) && (
                    <p className="text-xs text-slate-400 mt-1">
                      {(lead.deals ?? []).filter(d => d.product).map(d => d.product!.name).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/[0.03] flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-emerald-400">Venda</p>
                <button onClick={() => onRequestEditDeal(lead)}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{ background: '#6a11cb', color: '#fff' }}
                >
                  Editar Valor e Produtos
                </button>
              </div>
            </>
          ) : null}
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

function LeadCard({ lead, currency, onClick, isDragging }: { lead: Lead; currency: string; onClick: () => void; isDragging?: boolean }) {
  const router = useRouter()
  const cs = currency === 'USD' ? 'US$' : 'R$'
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: isSortableDragging ? 0.35 : 1,
    scale: isSortableDragging ? 0.97 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`glass rounded-lg p-3 space-y-2 cursor-grab active:cursor-grabbing transition-shadow duration-150 ${isDragging ? 'shadow-2xl shadow-[#6a11cb]/30 rotate-2 scale-105 ring-1 ring-[#6a11cb]/50' : 'card-hover'}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white leading-tight flex-1">{lead.name}</p>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {lead.phone && (
            <button
              onClick={e => { e.stopPropagation(); router.push(`/conversas?phone=${lead.phone!.replace(/\D/g, '')}`) }}
              className="text-slate-600 hover:text-green-400 transition-colors"
              title="Abrir conversa no WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          )}
          {lead.phone && (
            <a
              href={`sms:${lead.phone}`}
              onClick={e => e.stopPropagation()}
              className="text-slate-600 hover:text-blue-400 transition-colors"
              title="Enviar SMS"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              onClick={e => e.stopPropagation()}
              className="text-slate-600 hover:text-amber-400 transition-colors"
              title="Enviar email"
            >
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          <GripVertical className="w-3.5 h-3.5 text-slate-700" />
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

      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <Calendar className="w-3 h-3 flex-shrink-0" />
        <span>{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
      </div>

      {lead.dealValue ? (
        <div>
          <div className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <DollarSign className="w-3 h-3" />
            {cs} {lead.dealValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          {(lead.deals ?? []).some(d => d.product) && (
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
              {(lead.deals ?? []).filter(d => d.product).map(d => d.product!.name).join(', ')}
            </p>
          )}
        </div>
      ) : null}
      {(lead.source || lead.utmSource || lead.utmMedium) && (() => {
        const sourceLabel = lead.source || lead.utmSource || ''
        const sc = sourceLabel ? sourceBadgeStyle(sourceLabel) : null
        const mc = lead.utmMedium ? mediumBadgeStyle(lead.utmMedium) : null
        return (
          <div className="flex flex-wrap items-center gap-1">
            {lead.ctwaClid && (
              <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex-shrink-0">
                <MessageCircle className="w-2.5 h-2.5" />
                WA
              </span>
            )}
            {sc && (
              <span
                className="text-xs px-1.5 py-0.5 rounded border font-medium leading-tight"
                style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
              >
                {sourceLabel}
              </span>
            )}
            {mc && (
              <span
                className="text-xs px-1.5 py-0.5 rounded border font-medium leading-tight"
                style={{ background: mc.bg, color: mc.text, borderColor: mc.border }}
              >
                {lead.utmMedium}
              </span>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

// Efeito de "assentar" o card ao soltar — leve escala + sombre suavizando até sumir,
// em vez do card só piscar de volta pro lugar sem transição nenhuma.
const dropAnimation: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.4' } },
  }),
}

function Column({ stage, leads, currency, onCardClick }: { stage: Stage; leads: Lead[]; currency: string; onCardClick: (lead: Lead) => void }) {
  // A coluna inteira precisa ser um droppable próprio — sem isso, só os cards (via
  // useSortable) contam como alvo de drop, então soltar em espaço vazio (coluna vazia ou
  // abaixo do último card) não move o lead pra essa etapa.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div className="flex flex-col flex-shrink-0 w-64">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{stage.name}</span>
          <span className="text-xs text-slate-600 bg-[#1e1635] px-1.5 py-0.5 rounded-full">{leads.length}</span>
        </div>
        {stage.triggerCapiEvent !== 'none' && (
          <span className="text-xs text-[#8b5cf6] bg-[#6a11cb]/10 border border-[#6a11cb]/20 px-1.5 py-0.5 rounded flex-shrink-0">
            CAPI
          </span>
        )}
      </div>

      <div ref={setNodeRef}
        className={`flex-1 glass stage-tint rounded-xl p-2 space-y-2 min-h-[200px] overflow-y-auto transition-colors ${isOver ? 'ring-2 ring-[#6a11cb]/60' : ''}`}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} currency={currency} onClick={() => onCardClick(lead)} />
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

// ── New lead modal ───────────────────────────────────────────────────────────

function NewLeadModal({ stages, token, onClose, onCreated }: {
  stages: Stage[]
  token: string
  onClose: () => void
  onCreated: (lead: Lead) => void
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    clientType: '',
    source: '',
    pipelineStageId: stages[0]?.id ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleCreate() {
    if (!form.name.trim() || !form.pipelineStageId) {
      toast.error('Nome e estágio são obrigatórios')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          clientType: form.clientType || undefined,
          source: form.source || undefined,
          stageId: form.pipelineStageId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Erro ao criar lead')
      }
      const created = await res.json()
      onCreated(created)
      toast.success('Lead criado')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 theme-locked-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1635]">
          <h2 className="text-sm font-bold text-white">Novo Lead</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Nome</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} autoFocus
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Estágio</label>
              <select value={form.pipelineStageId} onChange={e => set('pipelineStageId', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Tipo de Cliente</label>
              <select value={form.clientType} onChange={e => set('clientType', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
                <option value="">Selecione...</option>
                {CLIENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
          </div>

          <OriginField value={form.source} onChange={v => set('source', v)} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#1e1635]">
          <button onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Criar Lead
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import leads modal ───────────────────────────────────────────────────────

function ImportLeadsModal({ stages, token, onClose, onImported }: {
  stages: Stage[]
  token: string
  onClose: () => void
  onImported: () => void
}) {
  const [text, setText] = useState('')
  const [stageId, setStageId] = useState(stages[0]?.id ?? '')
  const [source, setSource] = useState('Importação Manual')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const rows = parseImportText(text)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const defaultStatus = stages[0]?.name ?? 'Novo Lead'
    const csv = [
      ['Nome', 'Telefone', 'Email', 'Origem', 'Status', 'Tipo de Cliente', 'Data do Lead', 'Observações'],
      ['Maria Silva', '11988887777', 'maria@email.com', 'Google', defaultStatus, 'Cliente Novo', '2026-08-11', ''],
    ].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo-importacao-leads.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    if (rows.length === 0) {
      toast.error('Cole ou envie ao menos uma linha com telefone ou e-mail')
      return
    }
    setImporting(true)
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: rows, stageId, source }),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      toast.success(`${result.created} lead${result.created === 1 ? '' : 's'} importado${result.created === 1 ? '' : 's'}${result.duplicated ? ` — ${result.duplicated} já existia(m)` : ''}${result.invalid ? ` — ${result.invalid} sem identificação` : ''}${result.statusFallback ? ` — ${result.statusFallback} com status não encontrado` : ''}`)
      onImported()
      onClose()
    } catch {
      toast.error('Erro ao importar leads')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 theme-locked-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-lg shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1635]">
          <h2 className="text-sm font-bold text-white">Importar Leads</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Estágio de entrada</label>
              <select value={stageId} onChange={e => setStageId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]">
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Origem</label>
              <input value={source} onChange={e => setSource(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">Cole os leads ou envie um CSV</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={downloadTemplate}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors">
                  <Download className="h-3 w-3" /> Modelo
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#8b5cf6] hover:text-white transition-colors">
                  Enviar arquivo .csv
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
              placeholder={'Nome,Telefone,Email,Origem,Status,Data do Lead\nMaria Silva,11988887777,maria@email.com,Google,Novo Lead,2026-08-11'}
              className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] font-mono" />
            <p className="text-xs text-slate-500">
              {rows.length > 0
                ? `${rows.length} lead${rows.length === 1 ? '' : 's'} detectado${rows.length === 1 ? '' : 's'}${rows.some(row => row.status) ? ` — ${rows.filter(row => row.status).length} com status definido` : ''}`
                : 'O CSV original do Google Local Services é reconhecido automaticamente. Para definir o estágio por linha, use a coluna Status.'}
            </p>
            {rows.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-[#1e1635] bg-[#090713]">
                <div className="grid grid-cols-[1fr_1fr_120px] gap-2 border-b border-[#1e1635] px-3 py-2 text-[10px] font-semibold uppercase text-slate-600">
                  <span>Lead</span><span>Contato</span><span>Status</span>
                </div>
                {rows.slice(0, 5).map((row, index) => (
                  <div key={`${row.importKey ?? row.phone ?? row.email}-${index}`}
                    className="grid grid-cols-[1fr_1fr_120px] gap-2 border-b border-[#1e1635]/70 px-3 py-2 text-[11px] last:border-0">
                    <span className="truncate text-slate-300">{row.name || 'Sem nome'}</span>
                    <span className="truncate text-slate-500">{row.phone || row.email || row.utmMedium || 'Sem contato'}</span>
                    <span className="truncate text-[#a78bfa]">{row.status || stages.find(stage => stage.id === stageId)?.name || 'Padrão'}</span>
                  </div>
                ))}
                {rows.length > 5 && (
                  <p className="px-3 py-2 text-[10px] text-slate-600">Mais {rows.length - 5} registros serão importados.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#1e1635]">
          <button onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={handleImport} disabled={importing || rows.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Importar {rows.length > 0 ? `(${rows.length})` : ''}
          </button>
        </div>
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
  const [period, setPeriod]   = useState<Period>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  const [nameFilter, setNameFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dealPending, setDealPending] = useState<{ lead: Lead; stageId: string } | null>(null)
  const [editDealFor, setEditDealFor] = useState<Lead | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [showImportLeads, setShowImportLeads] = useState(false)
  // Estágio do lead antes do drag começar — guardado num ref (não state) porque só serve pra
  // decidir, no drop, se precisa persistir (handleDragOver já vai ter mudado leads[].pipelineStageId
  // ao vivo pra o reordenamento visual acontecer durante o arrasto, não só depois de soltar).
  const dragStartStageRef = useRef<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // closestCorners compara os 4 cantos do retângulo do card arrastado (não só o ponteiro)
  // contra os cantos de cada droppable — perto da borda entre colunas, o retângulo do card
  // (mesma largura da coluna) já invade a coluna vizinha, fazendo o drop "vazar" pra ela antes
  // da hora (era a causa do "precisa arrastar bem além pra soltar na etapa certa"). pointerWithin
  // usa a posição real do mouse, que é o que o usuário espera; cai pra rectIntersection só se o
  // ponteiro estiver momentaneamente fora de qualquer droppable (ex: no gap entre colunas).
  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    return rectIntersection(args)
  }

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

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    dragStartStageRef.current = leads.find(l => l.id === event.active.id)?.pipelineStageId ?? null
  }

  // Roda a cada momento em que o card arrastado passa por cima de outro card/coluna — reordena
  // o array local ao vivo (sem tocar a API) pra que os outros leads "abram espaço" dinamicamente
  // durante o arrasto, em vez de só ajustar quando solta.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string
    if (activeId === overId) return

    setLeads(prev => {
      const activeLead = prev.find(l => l.id === activeId)
      if (!activeLead) return prev

      const overLead = prev.find(l => l.id === overId)
      const overIsStage = stages.some(s => s.id === overId)
      const targetStageId = overLead ? overLead.pipelineStageId : (overIsStage ? overId : null)
      if (!targetStageId) return prev

      const withoutActive = prev.filter(l => l.id !== activeId)
      let insertAt: number
      if (overLead) {
        insertAt = withoutActive.findIndex(l => l.id === overId)
      } else {
        // Área vazia da coluna (sem card embaixo do ponteiro) — manda pro fim do grupo dessa etapa.
        let lastIdx = -1
        withoutActive.forEach((l, i) => { if (l.pipelineStageId === targetStageId) lastIdx = i })
        insertAt = lastIdx + 1
      }

      const moved = { ...activeLead, pipelineStageId: targetStageId }
      const next = [...withoutActive]
      next.splice(insertAt, 0, moved)

      const unchanged = next.length === prev.length && next.every((l, i) => l.id === prev[i].id && l.pipelineStageId === prev[i].pipelineStageId)
      return unchanged ? prev : next
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const leadId = event.active.id as string
    const originStageId = dragStartStageRef.current
    dragStartStageRef.current = null

    // handleDragOver já moveu leads[] pro estágio/posição visual final — só falta persistir
    // se o estágio realmente mudou em relação ao que era antes do drag começar.
    const lead = leads.find(l => l.id === leadId)
    if (!lead || !originStageId || lead.pipelineStageId === originStageId) return

    const targetStageId = lead.pipelineStageId
    const targetStage = stages.find(s => s.id === targetStageId)

    // If moving to a purchase stage → show deal popup (volta pro estágio original até confirmar)
    if (targetStage?.triggerCapiEvent === 'purchase') {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipelineStageId: originStageId } : l))
      setDealPending({ lead: { ...lead, pipelineStageId: originStageId }, stageId: targetStageId })
      return
    }

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
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipelineStageId: originStageId } : l))
      toast.error('Erro ao mover lead')
    }
  }

  function handleDealConfirm(updatedLead: Lead) {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l))
    setDealPending(null)
  }

  // "Pular" no popup de venda — move o lead pro estágio sem registrar produto/valor
  // (mesmo caminho que um estágio comum, que já dispara o evento CAPI se configurado).
  async function handleDealSkip() {
    if (!dealPending) return
    const { lead, stageId } = dealPending
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stageId }),
      })
      if (!res.ok) throw new Error()
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, pipelineStageId: stageId } : l))
    } catch {
      toast.error('Erro ao mover lead')
    } finally {
      setDealPending(null)
    }
  }

  function handleLeadSaved(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
    setSelectedLead(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev)
  }

  function handleLeadDeleted(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  function handleLeadCreated(lead: Lead) {
    setLeads(prev => [lead, ...prev])
  }

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null

  const availableSources = Array.from(new Set(leads.map(l => l.source || l.utmSource).filter((s): s is string => !!s))).sort()

  const nameQuery = nameFilter.trim().toLowerCase()
  const filteredLeads = leads.filter(l => {
    if (nameQuery && !l.name.toLowerCase().includes(nameQuery)) return false
    if (sourceFilter !== 'all' && (l.source || l.utmSource || '') !== sourceFilter) return false
    return true
  })

  const totalLeads = filteredLeads.length
  const totalValue = filteredLeads.reduce((s, l) => s + (l.dealValue ?? 0), 0)

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
          currency={currency}
          token={token!}
          onClose={() => setSelectedLead(null)}
          onSaved={handleLeadSaved}
          onDeleted={handleLeadDeleted}
          onRequestDeal={(lead, stageId) => { setSelectedLead(null); setDealPending({ lead, stageId }) }}
          onRequestEditDeal={setEditDealFor}
        />
      )}

      {editDealFor && (
        <DealPopup
          lead={editDealFor}
          products={products}
          currency={currency}
          token={token!}
          mode="edit"
          onConfirm={updated => { handleLeadSaved(updated); setEditDealFor(null) }}
          onCancel={() => setEditDealFor(null)}
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
          onSkip={handleDealSkip}
          onCancel={() => setDealPending(null)}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          stages={stages}
          token={token!}
          onClose={() => setShowNewLead(false)}
          onCreated={handleLeadCreated}
        />
      )}

      {showImportLeads && (
        <ImportLeadsModal
          stages={stages}
          token={token!}
          onClose={() => setShowImportLeads(false)}
          onImported={load}
        />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Pipeline CRM" />
        <main className="flex-1 overflow-hidden p-5 flex flex-col gap-4">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  value={nameFilter}
                  onChange={e => setNameFilter(e.target.value)}
                  placeholder="Buscar por nome..."
                  className="w-44 pl-8 pr-3 py-1.5 text-xs bg-[#0f0b1e] border border-[#1e1635] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
                />
              </div>
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-[#0f0b1e] border border-[#1e1635] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
              >
                <option value="all">Todas as origens</option>
                {availableSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="w-px h-4 bg-[#1e1635]" />
              <span className="text-xs text-slate-500">{totalLeads} leads</span>
              {totalValue > 0 && (
                <span className="text-xs text-emerald-400 font-medium">
                  {currency === 'USD' ? 'US$' : 'R$'} {totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em vendas
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setShowImportLeads(true)}
                disabled={stages.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-slate-300 font-medium hover:text-white bg-[#1a1230] border border-[#2d2550] transition-colors disabled:opacity-50">
                <Upload className="w-3.5 h-3.5" />
                Importar Leads
              </button>
              <button onClick={() => setShowNewLead(true)}
                disabled={stages.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
                <Plus className="w-3.5 h-3.5" />
                Novo Lead
              </button>
            </div>
          </div>

          {/* Kanban */}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
              {stages.map(stage => (
                <Column
                  key={stage.id}
                  stage={stage}
                  leads={filteredLeads.filter(l => l.pipelineStageId === stage.id)}
                  currency={currency}
                  onCardClick={setSelectedLead}
                />
              ))}
              {stages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-500">Nenhum estágio configurado.</p>
                </div>
              )}
            </div>
            <DragOverlay dropAnimation={dropAnimation}>
              {activeLead && <LeadCard lead={activeLead} currency={currency} onClick={() => {}} isDragging />}
            </DragOverlay>
          </DndContext>

        </main>
      </div>
    </>
  )
}
