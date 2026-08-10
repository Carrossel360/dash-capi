'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, DollarSign, Edit3, Loader2, Percent, Target, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface Summary {
  totalLinhasBc: number
  leadsUnicos: number
  duplicatas: number
  leadsConvertidos: number
  leadsNaoConvertidos: number
  faturamentoTotal: number
  ticketMedio: number
  taxaConversao: number
  leadsCrmTotal: number
  obs: string | null
}

interface Row {
  id: string
  origin: string
  period: string
  month: string | null
  leadsUnicos: number
  convertidos: number
  faturamento: number
  spend: number
}

const monthLabel = (period: string) => {
  if (period === 'total') return 'Resultados por Origem — Geral'
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return `${label.charAt(0).toUpperCase() + label.slice(1)} — por Origem`
}

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtMoney = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const fmtRoas = (n: number | null) => n == null ? '-' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`

function derive(rows: Row[]) {
  const leads = rows.reduce((s, r) => s + r.leadsUnicos, 0)
  const conv = rows.reduce((s, r) => s + r.convertidos, 0)
  const faturamento = rows.reduce((s, r) => s + r.faturamento, 0)
  const spend = rows.reduce((s, r) => s + r.spend, 0)
  return {
    leads,
    conv,
    faturamento,
    spend,
    taxa: leads > 0 ? (conv / leads) * 100 : 0,
    ticket: conv > 0 ? faturamento / conv : 0,
    roas: spend > 0 ? faturamento / spend : null,
  }
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]"
      />
    </label>
  )
}

function SummaryModal({ summary, token, onClose, onSaved }: { summary: Summary; token: string; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Summary>(summary)
  const [saving, setSaving] = useState(false)
  const set = (key: keyof Summary, value: number | string) => setDraft(prev => ({ ...prev, [key]: value }))

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/leads-cruzamento', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ summary: draft }),
      })
      if (!res.ok) throw new Error()
      toast.success('Indicadores atualizados')
      onSaved()
      onClose()
    } catch {
      toast.error('Erro ao salvar indicadores')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 theme-locked-modal">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#2d2550] bg-[#0d0a1f] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1635]">
          <h2 className="text-sm font-bold text-white">Editar Indicadores</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <NumberInput label="Total de linhas BC" value={draft.totalLinhasBc} onChange={v => set('totalLinhasBc', v)} />
          <NumberInput label="Leads únicos" value={draft.leadsUnicos} onChange={v => set('leadsUnicos', v)} />
          <NumberInput label="Duplicatas" value={draft.duplicatas} onChange={v => set('duplicatas', v)} />
          <NumberInput label="Leads convertidos" value={draft.leadsConvertidos} onChange={v => set('leadsConvertidos', v)} />
          <NumberInput label="Leads CRM total" value={draft.leadsCrmTotal} onChange={v => set('leadsCrmTotal', v)} />
          <NumberInput label="Faturamento total" value={draft.faturamentoTotal} onChange={v => set('faturamentoTotal', v)} />
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-[#2d2550] bg-[#1a1230]/50 p-3">
            <div>
              <p className="text-xs text-slate-500">Não convertidos</p>
              <p className="text-sm font-semibold text-white">{fmtInt(Math.max(0, draft.leadsUnicos - draft.leadsConvertidos))}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ticket médio</p>
              <p className="text-sm font-semibold text-white">{fmtMoney(draft.leadsConvertidos > 0 ? draft.faturamentoTotal / draft.leadsConvertidos : 0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Taxa de conversão</p>
              <p className="text-sm font-semibold text-white">{fmtPct(draft.leadsUnicos > 0 ? (draft.leadsConvertidos / draft.leadsUnicos) * 100 : 0)}</p>
            </div>
          </div>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs text-slate-400">Observação</span>
            <textarea value={draft.obs ?? ''} onChange={e => set('obs', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb]" />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#1e1635]">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#6a11cb] disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function RowModal({ row, token, onClose, onSaved }: { row: Row; token: string; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(row)
  const [saving, setSaving] = useState(false)
  const set = (key: keyof Row, value: number) => setDraft(prev => ({ ...prev, [key]: value }))

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/leads-cruzamento', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ row: draft }),
      })
      if (!res.ok) throw new Error()
      toast.success('Linha atualizada')
      onSaved()
      onClose()
    } catch {
      toast.error('Erro ao salvar linha')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 theme-locked-modal">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[#2d2550] bg-[#0d0a1f] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1635]">
          <div>
            <h2 className="text-sm font-bold text-white">Editar Resultado</h2>
            <p className="text-xs text-slate-500">{monthLabel(row.period)} · {row.origin}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <NumberInput label="Leads únicos" value={draft.leadsUnicos} onChange={v => set('leadsUnicos', v)} />
          <NumberInput label="Convertidos" value={draft.convertidos} onChange={v => set('convertidos', v)} />
          <div className="md:col-span-2">
            <NumberInput label="Faturamento" value={draft.faturamento} onChange={v => set('faturamento', v)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#1e1635]">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#6a11cb] disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultTable({ title, rows, onEdit }: { title: string; rows: Row[]; onEdit: (row: Row) => void }) {
  const ordered = ['Google', 'Indefinido', 'Meta'].map(o => rows.find(r => r.origin === o)).filter((r): r is Row => !!r)
  const total = derive(ordered)
  const color = title.includes('Março') || title.includes('Junho') ? '#2f6b35' : title.includes('Abril') || title.includes('Julho') ? '#70368f' : '#23486f'
  return (
    <section className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex px-3 py-1.5 rounded-md text-xs font-bold uppercase text-white" style={{ background: color }}>
          {title}
        </span>
        <button onClick={() => ordered[0] && onEdit(ordered[0])}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2d2550] text-xs text-slate-300 hover:text-white hover:border-[#6a11cb]">
          <Edit3 className="w-3.5 h-3.5" /> Editar
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#2d2550]">
        <table className="w-full text-xs">
          <thead style={{ background: color }}>
            <tr>
              {['Origem', 'Leads Únicos', 'Convertidos', 'Taxa Conv.', 'Faturamento', 'Ticket Médio', 'ROAS'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-bold text-white whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map(r => {
              const taxa = r.leadsUnicos > 0 ? (r.convertidos / r.leadsUnicos) * 100 : 0
              const ticket = r.convertidos > 0 ? r.faturamento / r.convertidos : 0
              const roas = r.origin === 'Indefinido' ? null : (r.spend > 0 ? r.faturamento / r.spend : 0)
              return (
                <tr key={r.id} onClick={() => onEdit(r)} className="border-b border-[#2d2550]/70 hover:bg-white/[0.03] cursor-pointer">
                  <td className="px-3 py-2.5 text-white font-medium">{r.origin}</td>
                  <td className="px-3 py-2.5 text-slate-200 text-right">{fmtInt(r.leadsUnicos)}</td>
                  <td className="px-3 py-2.5 text-slate-200 text-right">{fmtInt(r.convertidos)}</td>
                  <td className="px-3 py-2.5 text-slate-200 text-right">{fmtPct(taxa)}</td>
                  <td className="px-3 py-2.5 text-slate-200 text-right">{fmtMoney(r.faturamento)}</td>
                  <td className="px-3 py-2.5 text-slate-200 text-right">{fmtMoney(ticket)}</td>
                  <td className="px-3 py-2.5 text-slate-200 text-right">{fmtRoas(roas)}</td>
                </tr>
              )
            })}
            <tr className="bg-white/[0.03]">
              <td className="px-3 py-2.5 text-white font-bold">TOTAL</td>
              <td className="px-3 py-2.5 text-white font-bold text-right">{fmtInt(total.leads)}</td>
              <td className="px-3 py-2.5 text-white font-bold text-right">{fmtInt(total.conv)}</td>
              <td className="px-3 py-2.5 text-white font-bold text-right">{fmtPct(total.taxa)}</td>
              <td className="px-3 py-2.5 text-white font-bold text-right">{fmtMoney(total.faturamento)}</td>
              <td className="px-3 py-2.5 text-white font-bold text-right">{fmtMoney(total.ticket)}</td>
              <td className="px-3 py-2.5 text-white font-bold text-right">{fmtRoas(total.roas)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function LeadReconciliationPanel({ token }: { token: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [editSummary, setEditSummary] = useState(false)
  const [editRow, setEditRow] = useState<Row | null>(null)
  const [newPeriod, setNewPeriod] = useState('')
  const [addingMonth, setAddingMonth] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/leads-cruzamento', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao carregar')
      setSummary(data.summary)
      setRows(data.rows ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar cruzamento')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const periods = Array.from(new Set(rows.map(r => r.period))).sort((a, b) => {
      if (a === 'total') return -1
      if (b === 'total') return 1
      return a.localeCompare(b)
    })
    return periods.map(period => ({ period, rows: rows.filter(r => r.period === period) }))
  }, [rows])

  useEffect(() => {
    if (newPeriod || rows.length === 0) return
    const monthly = rows.map(r => r.period).filter(p => p !== 'total').sort()
    const last = monthly[monthly.length - 1]
    if (!last) return
    const [y, m] = last.split('-').map(Number)
    const next = new Date(y, m, 1)
    setNewPeriod(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }, [rows, newPeriod])

  async function addMonth() {
    if (!newPeriod) return
    setAddingMonth(true)
    try {
      for (const origin of ['Google', 'Meta', 'Indefinido']) {
        const res = await fetch('/api/leads-cruzamento', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ row: { period: newPeriod, origin, leadsUnicos: 0, convertidos: 0, faturamento: 0 } }),
        })
        if (!res.ok) throw new Error()
      }
      toast.success('Mês adicionado')
      await load()
    } catch {
      toast.error('Erro ao adicionar mês')
    } finally {
      setAddingMonth(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#6a11cb]" /></div>
  }

  if (!summary) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <AlertCircle className="w-8 h-8 mx-auto text-amber-400 mb-2" />
        <p className="text-sm text-white font-medium">Dados de cruzamento ainda não cadastrados.</p>
        <p className="text-xs text-slate-500 mt-1">Insira os dados históricos do Matri para ativar esta visão.</p>
      </div>
    )
  }

  const kpis = [
    { label: 'Total de Linhas (Lead BC)', value: fmtInt(summary.totalLinhasBc), icon: Users },
    { label: 'Leads Únicos (por tel.)', value: fmtInt(summary.leadsUnicos), icon: Users },
    { label: 'Duplicatas na Base', value: fmtInt(summary.duplicatas), icon: AlertCircle },
    { label: 'Leads Convertidos', value: fmtInt(summary.leadsConvertidos), icon: Target },
    { label: 'Taxa de Conversão', value: fmtPct(summary.taxaConversao), icon: Percent },
    { label: 'Faturamento Total', value: fmtMoney(summary.faturamentoTotal), icon: DollarSign },
    { label: 'Ticket Médio', value: fmtMoney(summary.ticketMedio), icon: DollarSign },
    { label: 'Não Convertidos', value: fmtInt(summary.leadsNaoConvertidos), icon: Users },
    { label: 'Leads CRM (total)', value: fmtInt(summary.leadsCrmTotal), icon: Users },
  ]

  return (
    <div className="space-y-6">
      {editSummary && <SummaryModal summary={summary} token={token} onClose={() => setEditSummary(false)} onSaved={load} />}
      {editRow && <RowModal row={editRow} token={token} onClose={() => setEditRow(null)} onSaved={load} />}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Cruzamento de Leads — Salão Matri</h2>
          <p className="text-sm text-slate-400 mt-1">Lead BC × Controle de Atendimento CRM+Tráfego</p>
        </div>
        <button onClick={() => setEditSummary(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2d2550] text-sm text-slate-300 hover:text-white hover:border-[#6a11cb]">
          <Edit3 className="w-4 h-4" /> Editar Indicadores
        </button>
      </div>

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Indicadores Gerais</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div key={label} className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#6a11cb]/25 flex items-center justify-center theme-locked-accent">
                <Icon className="w-4 h-4 text-[#a855f7]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-400 truncate">{label}</p>
                <p className="text-xl font-bold text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
        {summary.obs && <p className="text-xs text-slate-400 leading-relaxed">{summary.obs}</p>}
      </section>

      <section className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Resultados por Origem</p>
        {groups.map(g => (
          <ResultTable key={g.period} title={monthLabel(g.period)} rows={g.rows} onEdit={setEditRow} />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={newPeriod}
            onChange={e => setNewPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs bg-[#0f0b1e] border border-[#2d2550] text-white focus:outline-none focus:border-[#6a11cb]"
          />
          <button onClick={addMonth} disabled={addingMonth || !newPeriod}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2d2550] text-xs font-semibold text-slate-300 hover:text-white hover:border-[#6a11cb] disabled:opacity-50">
            {addingMonth ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '+'}
            Adicionar Mês
          </button>
        </div>
      </section>
    </div>
  )
}
