'use client'
import { useEffect, useMemo, useState } from 'react'
import { Bell, GripVertical, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { TaskStatusOption } from './task-types'
import type { TaskSpace } from './CreateTaskModal'

const FIELD_TYPES = [
  ['text', 'Texto'], ['number', 'Número'], ['date', 'Data'], ['select', 'Seleção'],
  ['checkbox', 'Checkbox'], ['url', 'Link'], ['client', 'Cliente'], ['service', 'Serviço'], ['task', 'Relação com tarefa'],
]

export default function TaskSettingsModal({ statuses, spaces, activeSpaceId, activeFolderId, activeProjectId, token, onChanged, onClose }: {
  statuses: TaskStatusOption[]
  spaces: TaskSpace[]
  activeSpaceId: string | null
  activeFolderId: string | null
  activeProjectId: string | null
  token: string
  onChanged: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'statuses' | 'fields' | 'notifications'>('statuses')
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6a11cb')
  const [fieldType, setFieldType] = useState('text')
  const [fieldOptions, setFieldOptions] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<{ eventType: string; inApp: boolean; email: boolean; sound: boolean }[]>([])
  const h = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token])

  useEffect(() => {
    fetch('/api/tasks/preferences', { headers: h }).then(res => res.json()).then(data => setPreferences(data.preferences ?? []))
  }, [h])

  async function updatePreference(eventType: string, key: 'inApp' | 'email' | 'sound', value: boolean) {
    setPreferences(prev => prev.map(item => item.eventType === eventType ? { ...item, [key]: value } : item))
    await fetch('/api/tasks/preferences', { method: 'PUT', headers: h, body: JSON.stringify({ eventType, [key]: value }) })
  }

  async function addStatus() {
    if (!name.trim()) return
    const res = await fetch('/api/tasks/statuses', { method: 'POST', headers: h, body: JSON.stringify({ name, color }) })
    if (!res.ok) return toast.error('Não foi possível criar o status')
    setName(''); onChanged()
  }

  async function renameStatus(status: TaskStatusOption) {
    const next = prompt('Nome do status', status.name)?.trim()
    if (!next || next === status.name) return
    await fetch(`/api/tasks/statuses/${status.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ name: next }) })
    onChanged()
  }

  async function deleteStatus(status: TaskStatusOption) {
    const replacement = statuses.find(item => item.id !== status.id)
    if (!replacement || !confirm(`Excluir “${status.name}”? As tarefas serão movidas para “${replacement.name}”.`)) return
    const res = await fetch(`/api/tasks/statuses/${status.id}?replacementKey=${encodeURIComponent(replacement.key)}`, { method: 'DELETE', headers: h })
    if (!res.ok) return toast.error('Não foi possível excluir o status')
    onChanged()
  }

  async function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return
    const next = [...statuses]
    const from = next.findIndex(item => item.id === dragId)
    const to = next.findIndex(item => item.id === targetId)
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await Promise.all(next.map((status, position) => fetch(`/api/tasks/statuses/${status.id}`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ position }),
    })))
    setDragId(null); onChanged()
  }

  async function addField() {
    if (!name.trim()) return
    const options = fieldType === 'select'
      ? fieldOptions.split(',').map(label => label.trim()).filter(Boolean).map(label => ({ label }))
      : null
    const res = await fetch('/api/tasks/custom-fields', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        name, type: fieldType, options,
        spaceId: activeSpaceId, folderId: activeFolderId, projectId: activeProjectId,
      }),
    })
    if (!res.ok) return toast.error('Não foi possível criar o campo')
    setName(''); setFieldOptions(''); toast.success('Campo criado no escopo atual'); onChanged()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 theme-locked-modal" style={{ background: 'rgba(0,0,0,.75)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl border border-[#2d2550] rounded-lg overflow-hidden shadow-2xl" style={{ background: '#0a0818' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1635]">
          <div>
            <h2 className="text-sm font-semibold text-white">Configurações das tarefas</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Campos novos são aplicados à lista, pasta ou Space selecionado.</p>
          </div>
          <button onClick={onClose} title="Fechar" className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex border-b border-[#1e1635] px-4">
          <button onClick={() => { setTab('statuses'); setName('') }} className={`px-3 py-2 text-xs border-b-2 ${tab === 'statuses' ? 'text-purple-400 border-purple-500' : 'text-slate-500 border-transparent'}`}>Status</button>
          <button onClick={() => { setTab('fields'); setName('') }} className={`px-3 py-2 text-xs border-b-2 ${tab === 'fields' ? 'text-purple-400 border-purple-500' : 'text-slate-500 border-transparent'}`}>Campos personalizados</button>
          <button onClick={() => { setTab('notifications'); setName('') }} className={`px-3 py-2 text-xs border-b-2 ${tab === 'notifications' ? 'text-purple-400 border-purple-500' : 'text-slate-500 border-transparent'}`}>Notificações</button>
        </div>
        <div className="p-4 max-h-[62vh] overflow-y-auto">
          {tab === 'statuses' ? (
            <>
              <div className="space-y-1 mb-4">
                {statuses.map(status => (
                  <div key={status.id} draggable onDragStart={() => setDragId(status.id)} onDragOver={e => e.preventDefault()} onDrop={() => reorder(status.id)}
                    className="flex items-center gap-2 px-2 py-2 border border-[#1e1635] rounded-md bg-white/[0.02]">
                    <GripVertical className="w-4 h-4 text-slate-600 cursor-grab" />
                    <span className="w-3 h-3 rounded-full" style={{ background: status.color }} />
                    <button onClick={() => renameStatus(status)} className="flex-1 text-left text-xs text-slate-200 hover:text-white">{status.name}</button>
                    <input type="color" value={status.color} title="Alterar cor" onChange={e => fetch(`/api/tasks/statuses/${status.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ color: e.target.value }) }).then(onChanged)} className="w-6 h-6 bg-transparent border-0" />
                    <button onClick={() => deleteStatus(status)} title="Excluir status" className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Novo status" className="flex-1 bg-[#0f0b1e] border border-[#2d2550] rounded-md px-3 py-2 text-xs text-white outline-none focus:border-purple-500" />
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-9 h-9 bg-transparent border-0" />
                <button onClick={addStatus} title="Adicionar status" className="w-9 h-9 rounded-md flex items-center justify-center text-white bg-purple-700"><Plus className="w-4 h-4" /></button>
              </div>
            </>
          ) : tab === 'fields' ? (
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do campo" className="w-full bg-[#0f0b1e] border border-[#2d2550] rounded-md px-3 py-2 text-xs text-white outline-none focus:border-purple-500" />
              <select value={fieldType} onChange={e => setFieldType(e.target.value)} className="w-full bg-[#0f0b1e] border border-[#2d2550] rounded-md px-3 py-2 text-xs text-slate-300 outline-none">
                {FIELD_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              {fieldType === 'select' && <input value={fieldOptions} onChange={e => setFieldOptions(e.target.value)} placeholder="Opções separadas por vírgula" className="w-full bg-[#0f0b1e] border border-[#2d2550] rounded-md px-3 py-2 text-xs text-white outline-none" />}
              <div className="text-[10px] text-slate-500">Escopo: {activeProjectId ? 'lista atual' : activeFolderId ? 'pasta atual' : activeSpaceId ? 'Space atual' : 'todo o workspace'}</div>
              <button onClick={addField} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-purple-700 text-xs font-medium text-white"><Plus className="w-3.5 h-3.5" />Criar campo</button>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_64px_64px_64px] gap-2 px-2 pb-2 text-[10px] text-slate-600 uppercase"><span>Evento</span><span>Sistema</span><span>E-mail</span><span>Som</span></div>
              {preferences.map(preference => <div key={preference.eventType} className="grid grid-cols-[1fr_64px_64px_64px] gap-2 items-center px-2 py-2.5 border-t border-[#1e1635]">
                <span className="flex items-center gap-2 text-xs text-slate-300"><Bell className="w-3.5 h-3.5 text-slate-500" />{{ assigned: 'Tarefa atribuída', mentioned: 'Menção', status_changed: 'Mudança de status', completed: 'Conclusão', due_reminder: 'Lembrete de prazo' }[preference.eventType] ?? preference.eventType}</span>
                {(['inApp', 'email', 'sound'] as const).map(key => <input key={key} type="checkbox" checked={preference[key]} onChange={e => updatePreference(preference.eventType, key, e.target.checked)} className="w-4 h-4 accent-purple-600" />)}
              </div>)}
              <p className="text-[10px] text-slate-600 mt-3">As mensagens por e-mail usam o SMTP já configurado no sistema.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
