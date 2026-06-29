'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Trash2, Send, ChevronDown, Calendar, Flag, User, Loader2, MessageSquare } from 'lucide-react'
import type { TaskSpace, Member, CustomField } from './CreateTaskModal'

const STATUSES = [
  { key: 'todo',        label: 'A Fazer',      color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
  { key: 'in_progress', label: 'Em Progresso', color: '#2575fc', bg: 'rgba(37,117,252,0.15)'  },
  { key: 'in_review',   label: 'Em Revisão',   color: '#F5A314', bg: 'rgba(245,163,20,0.15)'  },
  { key: 'done',        label: 'Concluído',     color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
]
const PRIORITIES = [
  { key: 'urgent', label: 'Urgente', color: '#ef4444' },
  { key: 'high',   label: 'Alta',    color: '#F5A314' },
  { key: 'medium', label: 'Média',   color: '#8b5cf6' },
  { key: 'low',    label: 'Baixa',   color: '#64748b' },
]

interface Comment { id: string; userId: string; userName: string; content: string; createdAt: string }
interface Subtask  { id: string; title: string; status: string; _count?: { subtasks: number } }
interface CFValue  { customFieldId: string; value: string | null; field: CustomField }

interface FullTask {
  id: string; title: string; description: string | null
  status: string; priority: string
  assigneeId: string | null; assigneeName: string | null
  startDate: string | null; dueDate: string | null
  projectId: string | null; taskTags: string[]
  project: { id: string; name: string; color: string; spaceId: string | null } | null
  subtasks: Subtask[]; comments: Comment[]; customFieldValues: CFValue[]
  createdByName: string | null; createdAt: string
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider w-24 flex-shrink-0 pt-1.5">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export default function TaskPanel({
  taskId, spaces, members, token, userName,
  onUpdated, onDeleted, onClose,
}: {
  taskId: string; spaces: TaskSpace[]; members: Member[]
  token: string; userName: string
  onUpdated: (id: string, data: Partial<FullTask>) => void
  onDeleted: (id: string) => void
  onClose: () => void
}) {
  const [task, setTask] = useState<FullTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [editTitle, setEditTitle] = useState(false)
  const [titleVal, setTitleVal] = useState('')
  const [subtaskInput, setSubtaskInput] = useState('')
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details')
  const h = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { headers: h() })
      const d = await res.json()
      if (d.task) { setTask(d.task); setTitleVal(d.task.title) }
    } finally { setLoading(false) }
  }, [taskId, h])

  useEffect(() => { load() }, [load])

  async function patch(data: Record<string, unknown>) {
    if (!task) return
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH', headers: h(), body: JSON.stringify(data),
    })
    const updated = { ...task, ...data } as FullTask
    setTask(updated)
    onUpdated(task.id, data as Partial<FullTask>)
  }

  async function patchCF(fieldId: string, value: string) {
    await patch({ customFieldValues: { [fieldId]: value } })
    setTask(prev => {
      if (!prev) return prev
      const existing = prev.customFieldValues.find(v => v.customFieldId === fieldId)
      if (existing) {
        return { ...prev, customFieldValues: prev.customFieldValues.map(v => v.customFieldId === fieldId ? { ...v, value } : v) }
      }
      const field = customFields.find(f => f.id === fieldId)
      if (!field) return prev
      return { ...prev, customFieldValues: [...prev.customFieldValues, { customFieldId: fieldId, value, field }] }
    })
  }

  async function addSubtask() {
    if (!subtaskInput.trim() || !task) return
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: h(),
      body: JSON.stringify({ title: subtaskInput.trim(), status: 'todo', priority: 'medium', parentId: task.id, createdByName: userName }),
    })
    const d = await res.json()
    if (d.task) {
      setTask(prev => prev ? { ...prev, subtasks: [...prev.subtasks, d.task] } : prev)
      setSubtaskInput('')
    }
  }

  async function toggleSubtask(sub: Subtask) {
    const newStatus = sub.status === 'done' ? 'todo' : 'done'
    await fetch(`/api/tasks/${sub.id}`, { method: 'PATCH', headers: h(), body: JSON.stringify({ status: newStatus }) })
    setTask(prev => prev ? { ...prev, subtasks: prev.subtasks.map(s => s.id === sub.id ? { ...s, status: newStatus } : s) } : prev)
  }

  async function deleteSubtask(subId: string) {
    await fetch(`/api/tasks/${subId}`, { method: 'DELETE', headers: h() })
    setTask(prev => prev ? { ...prev, subtasks: prev.subtasks.filter(s => s.id !== subId) } : prev)
  }

  async function sendComment() {
    if (!commentText.trim() || !task) return
    setSendingComment(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST', headers: h(), body: JSON.stringify({ content: commentText.trim(), userName }),
      })
      const d = await res.json()
      if (d.comment) { setTask(prev => prev ? { ...prev, comments: [...prev.comments, d.comment] } : prev); setCommentText('') }
    } finally { setSendingComment(false) }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm('Deletar esta tarefa?')) return
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: h() })
    onDeleted(task.id)
    onClose()
  }

  // Get custom fields for the task's space
  const taskSpace = spaces.find(s => s.id === task?.project?.spaceId || s.lists.some(l => l.id === task?.projectId) || s.folders.some(f => f.lists.some(l => l.id === task?.projectId)))
  const customFields: CustomField[] = taskSpace?.customFields ?? []

  const statusMeta = STATUSES.find(s => s.key === (task?.status ?? 'todo')) ?? STATUSES[0]
  const prioMeta   = PRIORITIES.find(p => p.key === (task?.priority ?? 'medium')) ?? PRIORITIES[2]

  const completedSubs = task?.subtasks.filter(s => s.status === 'done').length ?? 0
  const totalSubs = task?.subtasks.length ?? 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="h-full w-full max-w-[520px] border-l border-[#2d2550] flex flex-col overflow-hidden shadow-2xl animate-[slideInRight_0.2s_ease]"
        style={{ background: '#080612' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e1635] flex-shrink-0">
          {task?.project && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ background: task.project.color }} />
              <span>{task.project.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={handleDelete}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-white hover:bg-white/5 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading || !task ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#6a11cb] animate-spin" />
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="px-5 py-4 border-b border-[#1e1635] flex-shrink-0">
              {editTitle ? (
                <textarea autoFocus rows={2}
                  className="w-full text-base font-semibold text-white bg-transparent outline-none resize-none border-b border-[#6a11cb] pb-1"
                  value={titleVal}
                  onChange={e => setTitleVal(e.target.value)}
                  onBlur={() => { setEditTitle(false); if (titleVal.trim() && titleVal !== task.title) patch({ title: titleVal.trim() }) }}
                  onKeyDown={e => { if (e.key === 'Escape') { setEditTitle(false); setTitleVal(task.title) } }}
                />
              ) : (
                <h2 className="text-base font-semibold text-white cursor-text hover:text-slate-100 leading-snug"
                  onClick={() => setEditTitle(true)}>{task.title}</h2>
              )}
              {task.taskTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {task.taskTags.map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(106,17,203,0.2)', color: '#8b5cf6' }}>{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#1e1635] flex-shrink-0 px-5">
              {(['details', 'comments'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="py-2.5 px-1 mr-5 text-xs font-medium border-b-2 transition-all"
                  style={{
                    borderColor: activeTab === tab ? '#8b5cf6' : 'transparent',
                    color: activeTab === tab ? '#8b5cf6' : '#64748b',
                  }}>
                  {tab === 'details' ? 'Detalhes' : `Comentários${task.comments.length > 0 ? ` (${task.comments.length})` : ''}`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'details' && (
                <div className="px-5 py-4 space-y-1 divide-y divide-[#1e1635]">

                  {/* Status */}
                  <FieldRow label="Status">
                    <div className="relative">
                      <button onClick={() => setOpenDropdown(d => d === 'status' ? null : 'status')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: statusMeta.bg, color: statusMeta.color }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: statusMeta.color }} />
                        {statusMeta.label}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      {openDropdown === 'status' && (
                        <div className="absolute left-0 top-full mt-1 rounded-xl border border-[#2d2550] shadow-2xl z-50 overflow-hidden" style={{ background: '#0d0a1f' }}>
                          {STATUSES.map(s => (
                            <button key={s.key} onClick={() => { patch({ status: s.key }); setOpenDropdown(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
                              style={{ color: s.color }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}
                              {s.key === task.status && <span className="ml-auto opacity-60">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FieldRow>

                  {/* Priority */}
                  <FieldRow label="Prioridade">
                    <div className="relative">
                      <button onClick={() => setOpenDropdown(d => d === 'priority' ? null : 'priority')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: prioMeta.color + '1a', color: prioMeta.color }}>
                        <Flag className="w-3 h-3" />{prioMeta.label}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      {openDropdown === 'priority' && (
                        <div className="absolute left-0 top-full mt-1 rounded-xl border border-[#2d2550] shadow-2xl z-50 overflow-hidden" style={{ background: '#0d0a1f' }}>
                          {PRIORITIES.map(p => (
                            <button key={p.key} onClick={() => { patch({ priority: p.key }); setOpenDropdown(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
                              style={{ color: p.color }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.label}
                              {p.key === task.priority && <span className="ml-auto opacity-60">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FieldRow>

                  {/* Assignee */}
                  <FieldRow label="Responsável">
                    <div className="relative">
                      <button onClick={() => setOpenDropdown(d => d === 'assignee' ? null : 'assignee')}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-white/5 transition-all">
                        {task.assigneeName ? (
                          <>
                            <span className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center text-white font-bold"
                              style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
                              {task.assigneeName[0].toUpperCase()}
                            </span>
                            {task.assigneeName}
                          </>
                        ) : (
                          <><User className="w-3.5 h-3.5" />Sem responsável</>
                        )}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      {openDropdown === 'assignee' && (
                        <div className="absolute left-0 top-full mt-1 rounded-xl border border-[#2d2550] shadow-2xl z-50 overflow-hidden min-w-[180px]" style={{ background: '#0d0a1f' }}>
                          <button onClick={() => { patch({ assigneeId: null, assigneeName: null }); setOpenDropdown(null) }}
                            className="w-full px-3 py-2 text-xs text-slate-500 hover:bg-white/5 text-left">Sem responsável</button>
                          {members.map(m => (
                            <button key={m.id} onClick={() => { patch({ assigneeId: m.id, assigneeName: m.name }); setOpenDropdown(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                              <span className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center text-white font-bold"
                                style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
                                {m.name[0].toUpperCase()}
                              </span>
                              {m.name}
                              {m.id === task.assigneeId && <span className="ml-auto opacity-60 text-[10px]">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FieldRow>

                  {/* Dates */}
                  <FieldRow label="Início">
                    <input type="date" value={task.startDate ? task.startDate.slice(0, 10) : ''}
                      onChange={e => patch({ startDate: e.target.value || null })}
                      className="text-xs text-slate-300 bg-transparent outline-none border-b border-transparent hover:border-[#2d2550] focus:border-[#6a11cb] transition-colors py-0.5"
                      style={{ colorScheme: 'dark' }} />
                  </FieldRow>

                  <FieldRow label="Prazo">
                    <input type="date" value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                      onChange={e => patch({ dueDate: e.target.value || null })}
                      className="text-xs bg-transparent outline-none border-b border-transparent hover:border-[#2d2550] focus:border-[#6a11cb] transition-colors py-0.5"
                      style={{
                        colorScheme: 'dark',
                        color: task.dueDate && new Date(task.dueDate) < new Date() ? '#ef4444' : '#cbd5e1',
                      }} />
                  </FieldRow>

                  {/* Description */}
                  <div className="pt-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Descrição</p>
                    <textarea rows={4}
                      className="w-full text-xs text-slate-300 bg-[#0f0b1e] border border-[#1e1635] rounded-xl p-3 resize-none outline-none focus:border-[#6a11cb] transition-colors placeholder-slate-600"
                      placeholder="Adicionar descrição..."
                      defaultValue={task.description ?? ''}
                      onBlur={e => { if (e.target.value !== (task.description ?? '')) patch({ description: e.target.value }) }}
                    />
                  </div>

                  {/* Subtasks */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Subtarefas {totalSubs > 0 && `(${completedSubs}/${totalSubs})`}
                      </p>
                      {totalSubs > 0 && (
                        <div className="w-24 h-1.5 rounded-full bg-[#1e1635]">
                          <div className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${totalSubs > 0 ? (completedSubs / totalSubs) * 100 : 0}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {task.subtasks.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2 group">
                          <button onClick={() => toggleSubtask(sub)}
                            className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-all ${sub.status === 'done' ? 'border-emerald-500' : 'border-[#2d2550]'}`}
                            style={sub.status === 'done' ? { background: '#10b981' } : {}}>
                            {sub.status === 'done' && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                          <span className={`text-xs flex-1 ${sub.status === 'done' ? 'line-through text-slate-600' : 'text-slate-300'}`}>{sub.title}</span>
                          <button onClick={() => deleteSubtask(sub.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="flex-1 text-xs text-slate-300 bg-[#0f0b1e] border border-[#1e1635] rounded-lg px-3 py-1.5 outline-none focus:border-[#6a11cb] transition-colors placeholder-slate-600"
                        placeholder="Adicionar subtarefa..."
                        value={subtaskInput}
                        onChange={e => setSubtaskInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSubtask() }}
                      />
                      <button onClick={addSubtask}
                        className="px-2.5 rounded-lg text-xs transition-all"
                        style={{ background: 'rgba(106,17,203,0.2)', color: '#8b5cf6' }}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Custom fields */}
                  {customFields.length > 0 && (
                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Campos personalizados</p>
                      <div className="space-y-2">
                        {customFields.map(field => {
                          const val = task.customFieldValues.find(v => v.customFieldId === field.id)?.value ?? ''
                          return (
                            <div key={field.id} className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-500 w-28 flex-shrink-0">{field.name}</span>
                              {field.type === 'select' ? (
                                <select value={val}
                                  onChange={e => patchCF(field.id, e.target.value)}
                                  className="flex-1 text-xs bg-[#0f0b1e] border border-[#1e1635] rounded px-2 py-1 text-slate-300 outline-none">
                                  <option value="">—</option>
                                  {(field.options ?? []).map(opt => <option key={opt.label} value={opt.label}>{opt.label}</option>)}
                                </select>
                              ) : field.type === 'checkbox' ? (
                                <input type="checkbox" checked={val === 'true'}
                                  onChange={e => patchCF(field.id, e.target.checked ? 'true' : 'false')}
                                  className="w-4 h-4 accent-purple-600" />
                              ) : (
                                <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                  value={val}
                                  onChange={e => patchCF(field.id, e.target.value)}
                                  onBlur={e => patchCF(field.id, e.target.value)}
                                  className="flex-1 text-xs bg-transparent border-b border-[#1e1635] focus:border-[#6a11cb] outline-none text-slate-300 py-0.5 transition-colors"
                                  style={{ colorScheme: field.type === 'date' ? 'dark' : undefined }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Meta */}
                  {task.createdByName && (
                    <p className="pt-3 text-[10px] text-slate-700">
                      Criado por {task.createdByName} • {new Date(task.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="px-5 py-4 flex flex-col gap-4">
                  <div className="space-y-4">
                    {task.comments.length === 0 && (
                      <p className="text-xs text-slate-600 italic text-center py-4">Nenhum comentário ainda.</p>
                    )}
                    {task.comments.map(c => (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
                          {c.userName[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-semibold text-slate-300">{c.userName}</span>
                            <span className="text-[10px] text-slate-600">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 sticky bottom-0 pb-1">
                    <input
                      className="flex-1 text-xs text-slate-300 bg-[#0f0b1e] border border-[#2d2550] rounded-xl px-3 py-2 outline-none focus:border-[#6a11cb] transition-colors placeholder-slate-600"
                      placeholder="Comentar..."
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendComment() }}
                    />
                    <button onClick={sendComment} disabled={sendingComment || !commentText.trim()}
                      className="px-3 rounded-xl flex items-center gap-1 text-xs font-medium disabled:opacity-50 transition-all"
                      style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)', color: 'white' }}>
                      {sendingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
