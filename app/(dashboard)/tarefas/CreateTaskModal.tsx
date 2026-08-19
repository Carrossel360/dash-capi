'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Plus, ChevronDown, Calendar, User, Flag, Tag, Loader2, Building2, Clock3 } from 'lucide-react'
import type { TaskClientOption, TaskStatusOption } from './task-types'

export interface TaskSpace {
  id: string; name: string; color: string
  folders: { id: string; name: string; lists: TaskList[] }[]
  lists: TaskList[]
  customFields: CustomField[]
}

export interface TaskList { id: string; name: string; color: string }
export interface Member { id: string; name: string; email: string; role: string }
export interface CustomField {
  id: string; name: string; type: string
  spaceId?: string | null; folderId?: string | null; projectId?: string | null
  options?: { label: string; color?: string }[] | null
  required?: boolean
}
export interface TaskDraft {
  title: string; description: string; status: string; priority: string
  assigneeIds: string[]
  startDate: string; dueDate: string
  estimatedMinutes: string; clientWorkspaceId: string; serviceKey: string
  projectId: string; taskTags: string[]
  subtasks: { title: string; done: boolean }[]
  customFieldValues: Record<string, string>
}

const PRIORITIES = [
  { key: 'urgent', label: 'Urgente', color: '#ef4444' },
  { key: 'high',   label: 'Alta',    color: '#F5A314' },
  { key: 'medium', label: 'Média',   color: '#8b5cf6' },
  { key: 'low',    label: 'Baixa',   color: '#64748b' },
]

function Pill({ label, color, children, onClick }: { label: string; color: string; children?: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
      style={{ background: color + '1a', color, border: `1px solid ${color}40` }}>
      {children}
      <span>{label}</span>
      <ChevronDown className="w-3 h-3 opacity-60" />
    </button>
  )
}

function Dropdown<T extends { key: string; label: string; color?: string }>({
  options, value, onChange, onClose,
}: { options: T[]; value: string; onChange: (v: T) => void; onClose: () => void }) {
  return (
    <div className="absolute top-full left-0 mt-1 rounded-xl border border-[#2d2550] shadow-2xl z-50 overflow-hidden min-w-[160px]" style={{ background: '#0d0a1f' }}>
      {options.map(opt => (
        <button key={opt.key} onClick={() => { onChange(opt); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-all"
          style={{ color: opt.color ?? '#e2e8f0' }}>
          {opt.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />}
          {opt.label}
          {opt.key === value && <span className="ml-auto text-[10px] opacity-60">✓</span>}
        </button>
      ))}
    </div>
  )
}

export default function CreateTaskModal({
  spaces, members, statuses, clients, initialStatus, initialProjectId, token, userName,
  onCreated, onClose,
}: {
  spaces: TaskSpace[]; members: Member[]; statuses: TaskStatusOption[]; clients: TaskClientOption[]
  initialStatus?: string; initialProjectId?: string
  token: string; userName: string
  onCreated: (task: unknown) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: '', description: '', status: initialStatus ?? 'todo',
    priority: 'medium', assigneeIds: [],
    startDate: '', dueDate: '', projectId: initialProjectId ?? '',
    estimatedMinutes: '', clientWorkspaceId: '', serviceKey: '',
    taskTags: [], subtasks: [], customFieldValues: {},
  })
  const [subtaskInput, setSubtaskInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [taskOptions, setTaskOptions] = useState<{ id: string; title: string }[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    fetch('/api/tasks/search', { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json()).then(data => setTaskOptions(data.tasks ?? []))
  }, [token])

  useEffect(() => {
    if (!openDropdown) return
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target.closest('[data-task-dropdown]')) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [openDropdown])

  const selectedList = spaces.flatMap(s => [...s.lists, ...s.folders.flatMap(f => f.lists)]).find(l => l.id === draft.projectId)
  const selectedSpace = spaces.find(s => s.lists.some(l => l.id === draft.projectId) || s.folders.some(f => f.lists.some(l => l.id === draft.projectId)))
  const selectedFolder = selectedSpace?.folders.find(f => f.lists.some(l => l.id === draft.projectId))
  const selectedClient = clients.find(client => client.id === draft.clientWorkspaceId)

  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedSpace?.id) params.set('spaceId', selectedSpace.id)
    if (selectedFolder?.id) params.set('folderId', selectedFolder.id)
    if (draft.projectId) params.set('projectId', draft.projectId)
    fetch(`/api/tasks/custom-fields?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json()).then(data => setCustomFields(data.fields ?? [])).catch(() => setCustomFields([]))
  }, [draft.projectId, selectedSpace?.id, selectedFolder?.id, token])

  const set = (key: keyof TaskDraft, val: unknown) => setDraft(prev => ({ ...prev, [key]: val }))

  function addSubtask() {
    if (!subtaskInput.trim()) return
    set('subtasks', [...draft.subtasks, { title: subtaskInput.trim(), done: false }])
    setSubtaskInput('')
  }

  function addTag() {
    if (!tagInput.trim() || draft.taskTags.includes(tagInput.trim())) return
    set('taskTags', [...draft.taskTags, tagInput.trim()])
    setTagInput('')
  }

  async function handleCreate() {
    if (!draft.title.trim()) { titleRef.current?.focus(); return }
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          projectId: draft.projectId || null,
          assigneeIds: draft.assigneeIds,
          estimatedMinutes: draft.estimatedMinutes ? Number(draft.estimatedMinutes) : null,
          startDate: draft.startDate || null,
          dueDate: draft.dueDate || null,
          createdByName: userName,
        }),
      })
      const d = await res.json()
      if (!res.ok) return

      // Create subtasks
      for (const sub of draft.subtasks) {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: sub.title, status: sub.done ? 'done' : 'todo',
            priority: 'medium', parentId: d.task.id,
            workspaceId: d.task.workspaceId, createdByName: userName,
          }),
        })
      }

      onCreated(d.task)
      onClose()
    } finally { setSaving(false) }
  }

  const statusOptions = statuses.map(status => ({ ...status, label: status.name }))
  const statusMeta = statusOptions.find(s => s.key === draft.status) ?? statusOptions[0] ?? { key: 'todo', label: 'A Fazer', color: '#64748b' }
  const prioMeta = PRIORITIES.find(p => p.key === draft.priority) ?? PRIORITIES[2]
  const assigneeMeta = members.filter(m => draft.assigneeIds.includes(m.id))

  // Build flat list selector options
  const listOptions = spaces.flatMap(s => [
    ...s.lists.map(l => ({ key: l.id, label: `${s.name} / ${l.name}`, color: l.color })),
    ...s.folders.flatMap(f => f.lists.map(l => ({ key: l.id, label: `${s.name} / ${f.name} / ${l.name}`, color: l.color }))),
  ])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 theme-locked-modal" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl border border-[#2d2550] flex flex-col overflow-hidden shadow-2xl"
        style={{ background: '#0a0818' }}>

        {/* Top bar: status, priority, assignee, list */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-[#1e1635] flex-wrap">
          {/* Status */}
          <div className="relative" data-task-dropdown>
            <Pill label={statusMeta.label} color={statusMeta.color}
              onClick={() => setOpenDropdown(d => d === 'status' ? null : 'status')}>
              <span className="w-2 h-2 rounded-full" style={{ background: statusMeta.color }} />
            </Pill>
            {openDropdown === 'status' && (
              <Dropdown options={statusOptions} value={draft.status}
                onChange={s => set('status', s.key)} onClose={() => setOpenDropdown(null)} />
            )}
          </div>

          {/* Priority */}
          <div className="relative" data-task-dropdown>
            <Pill label={prioMeta.label} color={prioMeta.color}
              onClick={() => setOpenDropdown(d => d === 'priority' ? null : 'priority')}>
              <Flag className="w-3 h-3" />
            </Pill>
            {openDropdown === 'priority' && (
              <Dropdown options={PRIORITIES} value={draft.priority}
                onChange={p => set('priority', p.key)} onClose={() => setOpenDropdown(null)} />
            )}
          </div>

          {/* Assignee */}
          <div className="relative" data-task-dropdown>
            <button onClick={() => setOpenDropdown(d => d === 'assignee' ? null : 'assignee')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 border"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', borderColor: '#2d2550' }}>
              {assigneeMeta.length ? (
                <>
                  <span className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center text-white font-bold"
                    style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
                    {assigneeMeta[0].name[0].toUpperCase()}
                  </span>
                  {assigneeMeta.length === 1 ? assigneeMeta[0].name.split(' ')[0] : `${assigneeMeta.length} responsáveis`}
                </>
              ) : (
                <><User className="w-3 h-3" />Responsável</>
              )}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {openDropdown === 'assignee' && (
              <div className="absolute top-full left-0 mt-1 rounded-xl border border-[#2d2550] shadow-2xl z-50 overflow-hidden min-w-[180px]" style={{ background: '#0d0a1f' }}>
                <button onClick={() => set('assigneeIds', [])}
                  className="w-full px-3 py-2 text-xs text-slate-500 hover:bg-white/5 text-left">Sem responsável</button>
                {members.map(m => (
                  <button key={m.id} onClick={() => set('assigneeIds', draft.assigneeIds.includes(m.id) ? draft.assigneeIds.filter(id => id !== m.id) : [...draft.assigneeIds, m.id])}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                    <span className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center text-white font-bold"
                      style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
                      {m.name[0].toUpperCase()}
                    </span>
                    {m.name}
                    {draft.assigneeIds.includes(m.id) && <span className="ml-auto opacity-60 text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          {listOptions.length > 0 && (
            <div className="relative ml-auto" data-task-dropdown>
              <button onClick={() => setOpenDropdown(d => d === 'list' ? null : 'list')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', borderColor: '#2d2550' }}>
                {draft.projectId ? (
                  <><span className="w-2 h-2 rounded-full" style={{ background: listOptions.find(l => l.key === draft.projectId)?.color ?? '#6a11cb' }} />
                  {listOptions.find(l => l.key === draft.projectId)?.label ?? 'Lista'}</>
                ) : 'Selecionar lista'}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {openDropdown === 'list' && (
                <div className="absolute top-full right-0 mt-1 rounded-xl border border-[#2d2550] shadow-2xl z-50 overflow-hidden min-w-[220px] max-h-48 overflow-y-auto" style={{ background: '#0d0a1f' }}>
                  <button onClick={() => { set('projectId', ''); setOpenDropdown(null) }}
                    className="w-full px-3 py-2 text-xs text-slate-500 hover:bg-white/5 text-left">Sem lista</button>
                  {listOptions.map(l => (
                    <button key={l.key} onClick={() => { set('projectId', l.key); setOpenDropdown(null) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 truncate text-left">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                      <span className="truncate">{l.label}</span>
                      {l.key === draft.projectId && <span className="ml-auto opacity-60 flex-shrink-0">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-all ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Title */}
          <div className="px-5 pt-4 pb-2">
            <input ref={titleRef}
              className="w-full text-lg font-semibold text-white bg-transparent outline-none placeholder-slate-600"
              placeholder="Título da tarefa..."
              value={draft.title}
              onChange={e => set('title', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>

          {/* Dates row */}
          <div className="px-5 py-3 flex items-center gap-4 border-y border-[#1e1635]">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Início:</span>
              <input type="date" value={draft.startDate}
                onChange={e => set('startDate', e.target.value)}
                className="bg-transparent text-slate-300 outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }} />
            </label>
            <span className="text-slate-700">→</span>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Prazo:</span>
              <input type="date" value={draft.dueDate}
                onChange={e => set('dueDate', e.target.value)}
                className="bg-transparent text-slate-300 outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }} />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500 ml-auto">
              <Clock3 className="w-3.5 h-3.5" />
              <span>Estimativa:</span>
              <input type="number" min="0" step="15" value={draft.estimatedMinutes}
                onChange={e => set('estimatedMinutes', e.target.value)} placeholder="min"
                className="w-16 bg-transparent text-slate-300 outline-none" />
            </label>
          </div>

          <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b border-[#1e1635]">
            <label className="text-[10px] text-slate-500">
              <span className="flex items-center gap-1 mb-1"><Building2 className="w-3 h-3" /> Cliente</span>
              <select value={draft.clientWorkspaceId}
                onChange={e => setDraft(prev => ({ ...prev, clientWorkspaceId: e.target.value, serviceKey: '' }))}
                className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2.5 py-2 text-slate-300 outline-none">
                <option value="">Sem cliente vinculado</option>
                {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-slate-500">
              <span className="block mb-1">Serviço do cliente</span>
              <select value={draft.serviceKey} onChange={e => set('serviceKey', e.target.value)} disabled={!selectedClient}
                className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2.5 py-2 text-slate-300 outline-none disabled:opacity-50">
                <option value="">Sem serviço vinculado</option>
                {selectedClient?.services.map(service => <option key={service.key} value={service.key}>{service.label}</option>)}
              </select>
            </label>
          </div>

          {/* Description */}
          <div className="px-5 py-4 border-b border-[#1e1635]">
            <textarea rows={4}
              className="w-full text-sm text-slate-300 bg-transparent outline-none resize-none placeholder-slate-600"
              placeholder="Adicionar descrição..."
              value={draft.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Subtasks */}
          <div className="px-5 py-4 border-b border-[#1e1635]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Subtarefas</p>
            <div className="space-y-2 mb-3">
              {draft.subtasks.map((sub, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button onClick={() => {
                    const updated = [...draft.subtasks]
                    updated[i] = { ...updated[i], done: !updated[i].done }
                    set('subtasks', updated)
                  }} className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-all ${sub.done ? 'border-emerald-500' : 'border-[#2d2550]'}`}
                    style={sub.done ? { background: '#10b981' } : {}}>
                    {sub.done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  <span className={`text-xs flex-1 ${sub.done ? 'line-through text-slate-600' : 'text-slate-300'}`}>{sub.title}</span>
                  <button onClick={() => set('subtasks', draft.subtasks.filter((_, j) => j !== i))}
                    className="text-slate-700 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 text-xs text-slate-300 bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-3 py-1.5 outline-none focus:border-[#6a11cb] transition-colors placeholder-slate-600"
                placeholder="Adicionar subtarefa..."
                value={subtaskInput}
                onChange={e => setSubtaskInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSubtask() }}
              />
              <button onClick={addSubtask}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(106,17,203,0.2)', color: '#8b5cf6' }}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tags */}
          <div className="px-5 py-4 border-b border-[#1e1635]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Tags</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {draft.taskTags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full"
                  style={{ background: 'rgba(106,17,203,0.2)', color: '#8b5cf6' }}>
                  {tag}
                  <button onClick={() => set('taskTags', draft.taskTags.filter(t => t !== tag))}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 text-xs text-slate-300 bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-3 py-1.5 outline-none focus:border-[#6a11cb] transition-colors placeholder-slate-600"
                placeholder="Adicionar tag..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTag() }}
              />
              <button onClick={addTag} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(106,17,203,0.2)', color: '#8b5cf6' }}>
                <Tag className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Campos personalizados</p>
              <div className="grid grid-cols-2 gap-3">
                {customFields.map(field => (
                  <div key={field.id}>
                    <label className="text-[10px] text-slate-500 block mb-1">
                      {field.name}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    {field.type === 'task' ? (
                      <select value={draft.customFieldValues[field.id] ?? ''} onChange={e => set('customFieldValues', { ...draft.customFieldValues, [field.id]: e.target.value })}
                        className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2 py-1.5 text-slate-300 outline-none">
                        <option value="">—</option>{taskOptions.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
                      </select>
                    ) : field.type === 'client' ? (
                      <select value={draft.customFieldValues[field.id] ?? ''} onChange={e => set('customFieldValues', { ...draft.customFieldValues, [field.id]: e.target.value })}
                        className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2 py-1.5 text-slate-300 outline-none">
                        <option value="">—</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                      </select>
                    ) : field.type === 'service' ? (
                      <select value={draft.customFieldValues[field.id] ?? ''} onChange={e => set('customFieldValues', { ...draft.customFieldValues, [field.id]: e.target.value })}
                        className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2 py-1.5 text-slate-300 outline-none">
                        <option value="">—</option>{Array.from(new Map(clients.flatMap(client => client.services).map(service => [service.key, service])).values()).map(service => <option key={service.key} value={service.key}>{service.label}</option>)}
                      </select>
                    ) : field.type === 'select' ? (
                      <select value={draft.customFieldValues[field.id] ?? ''}
                        onChange={e => set('customFieldValues', { ...draft.customFieldValues, [field.id]: e.target.value })}
                        className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2 py-1.5 text-slate-300 outline-none">
                        <option value="">—</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt.label} value={opt.label}>{opt.label}</option>
                        ))}
                      </select>
                    ) : field.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox"
                          checked={draft.customFieldValues[field.id] === 'true'}
                          onChange={e => set('customFieldValues', { ...draft.customFieldValues, [field.id]: e.target.checked ? 'true' : 'false' })}
                          className="w-4 h-4 accent-purple-600"
                        />
                        <span className="text-xs text-slate-400">Sim</span>
                      </label>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
                        value={draft.customFieldValues[field.id] ?? ''}
                        onChange={e => set('customFieldValues', { ...draft.customFieldValues, [field.id]: e.target.value })}
                        className="w-full text-xs bg-[#0f0b1e] border border-[#2d2550] rounded-lg px-2 py-1.5 text-slate-300 outline-none focus:border-[#6a11cb] transition-colors"
                        style={{ colorScheme: field.type === 'date' ? 'dark' : undefined }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#1e1635]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving || !draft.title.trim()}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Criar tarefa
          </button>
        </div>
      </div>
    </div>
  )
}
