'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, ChevronRight, ChevronDown, LayoutGrid, List, Settings2,
  Folder, FolderOpen, CheckSquare, Loader2, MoreHorizontal, Trash2,
  X, Hash, Filter, Search, BookmarkPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import CreateTaskModal from './CreateTaskModal'
import TaskPanel from './TaskPanel'
import TaskSettingsModal from './TaskSettingsModal'
import type { TaskSpace, Member, CustomField } from './CreateTaskModal'
import { EMPTY_FILTERS, statusBg, type TaskClientOption, type TaskFilters, type TaskSavedViewOption, type TaskStatusOption } from './task-types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskSummary {
  id: string; title: string; status: string; priority: string
  assigneeId: string | null; assigneeName: string | null
  startDate: string | null; dueDate: string | null
  projectId: string | null; taskTags: string[]
  clientWorkspaceId?: string | null; serviceKey?: string | null
  assignees?: { userId: string; userName: string }[]
  customFieldValues?: { customFieldId: string; value: string | null; field: CustomField }[]
  project: { id: string; name: string; color: string } | null
  _count: { comments: number; subtasks: number }
}

const PRIO_COLORS: Record<string, string> = {
  urgent: '#ef4444', high: '#F5A314', medium: '#8b5cf6', low: '#64748b',
}
const PRIO_LABELS: Record<string, string> = {
  urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa',
}

function fmtDate(d: string | null) {
  if (!d) return null
  const date = new Date(d)
  const now = new Date(); now.setHours(0,0,0,0)
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return { label: date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}), color: '#ef4444' }
  if (diff === 0) return { label: 'Hoje', color: '#F5A314' }
  if (diff === 1) return { label: 'Amanhã', color: '#F5A314' }
  return { label: date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}), color: '#64748b' }
}

// Todos os spaces/listas usam a mesma cor (roxo da marca) — sem seletor de cor, visual
// uniforme tipo ClickUp em vez de colorido por tópico.
const SPACE_COLOR = '#6a11cb'

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, onClick, isDragging,
  onDragStart, onDragEnd,
}: {
  task: TaskSummary; onClick: () => void; isDragging: boolean
  onDragStart: () => void; onDragEnd: () => void
}) {
  const due = fmtDate(task.dueDate)
  const prioColor = PRIO_COLORS[task.priority] ?? '#64748b'

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="glass card-hover rounded-xl p-3 cursor-grab active:cursor-grabbing select-none transition-opacity"
      style={{ borderColor: 'rgba(30,22,53,0.9)', opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: prioColor }} />
        <p className="text-xs font-medium text-slate-200 leading-relaxed line-clamp-2 flex-1">{task.title}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {task.project && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: task.project.color + '22', color: task.project.color }}>
            {task.project.name}
          </span>
        )}
        {task.taskTags.slice(0, 2).map(t => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(106,17,203,0.15)', color: '#8b5cf6' }}>{t}</span>
        ))}
        {due && (
          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: due.color }}>
            {due.label}
          </span>
        )}
        {task._count.comments > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-slate-600">
            💬{task._count.comments}
          </span>
        )}
        {task._count.subtasks > 0 && (
          <span className="text-[10px] text-slate-600">⚡{task._count.subtasks}</span>
        )}
        {task.assigneeName && (
          <span className="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
            {task.assigneeName[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── SpaceNav ─────────────────────────────────────────────────────────────────

function SpaceNav({
  spaces, activeListId, onSelectList, onRefresh, token, canEdit,
}: {
  spaces: TaskSpace[]
  activeListId: string | null
  onSelectList: (listId: string | null, spaceId: string | null) => void
  onRefresh: () => void
  token: string
  canEdit: boolean
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [foldersExpanded, setFoldersExpanded] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState<{ type: 'space' | 'folder' | 'list'; parentId?: string } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // Auto-expand space that contains active list
  useEffect(() => {
    if (!activeListId) return
    for (const space of spaces) {
      if (space.lists.some(l => l.id === activeListId) || space.folders.some(f => f.lists.some(l => l.id === activeListId))) {
        setExpanded(prev => ({ ...prev, [space.id]: true }))
      }
    }
  }, [activeListId, spaces])

  async function createSpace() {
    if (!nameInput.trim()) return
    await fetch('/api/tasks/spaces', { method: 'POST', headers: h, body: JSON.stringify({ name: nameInput.trim(), color: SPACE_COLOR }) })
    setCreating(null); setNameInput(''); onRefresh()
  }

  async function createFolder(spaceId: string) {
    if (!nameInput.trim()) return
    await fetch('/api/tasks/folders', { method: 'POST', headers: h, body: JSON.stringify({ spaceId, name: nameInput.trim() }) })
    setCreating(null); setNameInput(''); onRefresh()
  }

  async function createList(spaceId: string, folderId?: string) {
    if (!nameInput.trim()) return
    await fetch('/api/tasks/projects', { method: 'POST', headers: h, body: JSON.stringify({ name: nameInput.trim(), color: SPACE_COLOR, spaceId, folderId: folderId ?? null }) })
    setCreating(null); setNameInput(''); onRefresh()
  }

  async function deleteSpace(id: string) {
    if (!confirm('Deletar este space e todas as suas listas e tarefas?')) return
    await fetch(`/api/tasks/spaces/${id}`, { method: 'DELETE', headers: h })
    onRefresh()
  }

  async function deleteFolder(id: string) {
    if (!confirm('Deletar esta pasta e todas as suas listas e tarefas?')) return
    await fetch(`/api/tasks/folders/${id}`, { method: 'DELETE', headers: h })
    onRefresh()
  }

  async function deleteList(id: string) {
    if (!confirm('Deletar esta lista e todas as suas tarefas?')) return
    await fetch(`/api/tasks/projects/${id}`, { method: 'DELETE', headers: h })
    onRefresh()
  }

  function CreateForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div className="glass rounded-xl p-2.5 border border-[#6a11cb]/40 mx-1 my-1">
        <input autoFocus
          className="w-full text-xs text-slate-200 bg-transparent outline-none placeholder-slate-600 mb-2"
          placeholder="Nome..."
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel() }}
        />
        <div className="flex gap-1">
          <button onClick={onSubmit}
            className="text-[10px] px-2 py-1 rounded font-medium text-white"
            style={{ background: 'linear-gradient(135deg,#6a11cb,#2575fc)' }}>
            Criar
          </button>
          <button onClick={onCancel} className="text-[10px] px-2 py-1 rounded text-slate-500 hover:text-slate-300">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-[#1e1635] bg-[#080612] flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-[#1e1635] flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Spaces</p>
        {canEdit && (
          <button onClick={() => { setCreating({ type: 'space' }); setNameInput('') }}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* All tasks */}
        <button
          onClick={() => onSelectList(null, null)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all"
          style={!activeListId ? { color: '#F5A314' } : { color: '#94a3b8' }}>
          <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-left font-medium">Todas as tarefas</span>
        </button>

        {creating?.type === 'space' && (
          <CreateForm onSubmit={createSpace} onCancel={() => setCreating(null)} />
        )}

        {/* Spaces */}
        {spaces.map(space => {
          const isExpanded = expanded[space.id]
          const allLists = [...space.lists, ...space.folders.flatMap(f => f.lists)]
          const hasActive = allLists.some(l => l.id === activeListId)
          return (
            <div key={space.id}>
              {/* Space row */}
              <div className="group flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/[0.03] rounded-lg mx-1 cursor-pointer"
                onMouseEnter={() => setHover(space.id)} onMouseLeave={() => setHover(null)}
                onClick={() => {
                  setExpanded(prev => ({ ...prev, [space.id]: !prev[space.id] }))
                  onSelectList(null, space.id)
                }}>
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: space.color }} />
                <span className={`text-xs font-semibold flex-1 truncate ${hasActive ? 'text-white' : 'text-slate-400'}`}>{space.name}</span>
                {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
                {canEdit && hover === space.id && (
                  <div className="flex gap-0.5 ml-0.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setCreating({ type: 'list', parentId: space.id }); setNameInput('') }}
                      className="w-4 h-4 rounded flex items-center justify-center text-slate-600 hover:text-slate-300">
                      <Hash className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteSpace(space.id)}
                      className="w-4 h-4 rounded flex items-center justify-center text-slate-600 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="ml-3">
                  {/* Create list inside space */}
                  {creating?.type === 'list' && creating.parentId === space.id && !creating.parentId?.startsWith('folder:') && (
                    <CreateForm onSubmit={() => createList(space.id)} onCancel={() => setCreating(null)} />
                  )}

                  {/* Direct lists in space */}
                  {space.lists.map(list => (
                    <div key={list.id}
                      className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg mx-1 cursor-pointer hover:bg-white/[0.03]"
                      onClick={() => onSelectList(list.id, space.id)}
                      onMouseEnter={() => setHover(`list-${list.id}`)} onMouseLeave={() => setHover(null)}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: list.color }} />
                      <span className={`text-xs flex-1 truncate ${activeListId === list.id ? 'text-white font-medium' : 'text-slate-500'}`}>{list.name}</span>
                      {canEdit && hover === `list-${list.id}` && (
                        <button onClick={e => { e.stopPropagation(); deleteList(list.id) }}
                          className="w-4 h-4 rounded flex items-center justify-center text-slate-700 hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Folders */}
                  {space.folders.map(folder => {
                    const fExp = foldersExpanded[folder.id]
                    const fActive = folder.lists.some(l => l.id === activeListId)
                    return (
                      <div key={folder.id}>
                        <div className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg mx-1 cursor-pointer hover:bg-white/[0.03]"
                          onMouseEnter={() => setHover(`folder-${folder.id}`)} onMouseLeave={() => setHover(null)}
                          onClick={() => setFoldersExpanded(prev => ({ ...prev, [folder.id]: !prev[folder.id] }))}>
                          {fExp ? <FolderOpen className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
                          <span className={`text-xs flex-1 truncate ${fActive ? 'text-white font-medium' : 'text-slate-500'}`}>{folder.name}</span>
                          {fExp ? <ChevronDown className="w-3 h-3 text-slate-700" /> : <ChevronRight className="w-3 h-3 text-slate-700" />}
                          {canEdit && hover === `folder-${folder.id}` && (
                            <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setCreating({ type: 'list', parentId: `folder:${folder.id}:${space.id}` }); setNameInput('') }}
                                className="w-4 h-4 rounded flex items-center justify-center text-slate-600 hover:text-slate-300">
                                <Hash className="w-3 h-3" />
                              </button>
                              <button onClick={() => deleteFolder(folder.id)}
                                className="w-4 h-4 rounded flex items-center justify-center text-slate-600 hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {fExp && (
                          <div className="ml-4">
                            {creating?.type === 'list' && creating.parentId === `folder:${folder.id}:${space.id}` && (
                              <CreateForm onSubmit={() => createList(space.id, folder.id)} onCancel={() => setCreating(null)} />
                            )}
                            {folder.lists.map(list => (
                              <div key={list.id}
                                className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg mx-1 cursor-pointer hover:bg-white/[0.03]"
                                onClick={() => onSelectList(list.id, space.id)}
                                onMouseEnter={() => setHover(`list-${list.id}`)} onMouseLeave={() => setHover(null)}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: list.color }} />
                                <span className={`text-xs flex-1 truncate ${activeListId === list.id ? 'text-white font-medium' : 'text-slate-500'}`}>{list.name}</span>
                                {canEdit && hover === `list-${list.id}` && (
                                  <button onClick={e => { e.stopPropagation(); deleteList(list.id) }}
                                    className="w-4 h-4 rounded flex items-center justify-center text-slate-700 hover:text-red-400">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add folder button */}
                  {canEdit && (
                    <button onClick={() => { setCreating({ type: 'folder', parentId: space.id }); setNameInput('') }}
                      className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-slate-700 hover:text-slate-500 transition-all mx-1">
                      <Folder className="w-3 h-3" /><span>Nova pasta</span>
                    </button>
                  )}

                  {creating?.type === 'folder' && creating.parentId === space.id && (
                    <CreateForm onSubmit={() => createFolder(space.id)} onCancel={() => setCreating(null)} />
                  )}
                </div>
              )}
            </div>
          )
        })}

        {spaces.length === 0 && !creating && (
          <p className="text-[10px] text-slate-700 px-3 py-4 text-center">Nenhum space ainda.</p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TarefasPage() {
  const { token, user, currentWorkspace } = useAuthStore()
  const role = currentWorkspace?.role ?? ''
  const canManage = ['admin', 'manager'].includes(role)
  const canEdit = ['admin', 'manager', 'attendant'].includes(role)

  const [spaces, setSpaces]   = useState<TaskSpace[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks]     = useState<TaskSummary[]>([])
  const [statuses, setStatuses] = useState<TaskStatusOption[]>([])
  const [clients, setClients] = useState<TaskClientOption[]>([])
  const [savedViews, setSavedViews] = useState<TaskSavedViewOption[]>([])
  const [activeCustomFields, setActiveCustomFields] = useState<CustomField[]>([])
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const defaultViewApplied = useRef(false)
  const [loading, setLoading] = useState(true)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStatus, setCreateStatus] = useState('todo')
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  const h = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token])

  const loadSpaces = useCallback(async () => {
    if (!token) return
    const res = await fetch('/api/tasks/spaces', { headers: h() })
    const d = await res.json()
    setSpaces(d.spaces ?? [])
  }, [token, h])

  const loadConfiguration = useCallback(async () => {
    if (!token) return
    const [statusRes, optionRes, viewRes] = await Promise.all([
      fetch('/api/tasks/statuses', { headers: h() }),
      fetch('/api/tasks/options', { headers: h() }),
      fetch('/api/tasks/views', { headers: h() }),
    ])
    const [statusData, optionData, viewData] = await Promise.all([statusRes.json(), optionRes.json(), viewRes.json()])
    setStatuses(statusData.statuses ?? [])
    setClients(optionData.clients ?? [])
    setSavedViews(viewData.views ?? [])
    const defaultView = (viewData.views ?? []).find((item: TaskSavedViewOption) => item.isDefault)
    if (defaultView && !defaultViewApplied.current) {
      defaultViewApplied.current = true
      setFilters({ ...EMPTY_FILTERS, ...(defaultView.filters ?? {}) })
      setView(defaultView.viewType)
    }
  }, [token, h])

  const loadTasks = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeListId) params.set('projectId', activeListId)
      else if (activeSpaceId) params.set('spaceId', activeSpaceId)
      if (filters.search) params.set('search', filters.search)
      if (filters.statuses.length) params.set('statuses', filters.statuses.join(','))
      if (filters.priorities.length) params.set('priorities', filters.priorities.join(','))
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
      if (filters.clientId) params.set('clientId', filters.clientId)
      if (filters.serviceKey) params.set('serviceKey', filters.serviceKey)
      if (filters.dueFrom) params.set('dueFrom', filters.dueFrom)
      if (filters.dueTo) params.set('dueTo', `${filters.dueTo}T23:59:59.999`)
      const [tRes, mRes] = await Promise.all([
        fetch(`/api/tasks?${params}`, { headers: h() }),
        fetch('/api/workspace/members', { headers: h() }),
      ])
      const [td, md] = await Promise.all([tRes.json(), mRes.json()])
      setTasks(td.tasks ?? [])
      setMembers(md.members ?? [])
    } finally { setLoading(false) }
  }, [token, activeListId, activeSpaceId, filters, h])

  useEffect(() => { loadSpaces() }, [loadSpaces])
  useEffect(() => { loadConfiguration() }, [loadConfiguration])
  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('taskId')
    if (id) setSelectedTaskId(id)
  }, [])

  function handleSelectList(listId: string | null, spaceId: string | null) {
    setActiveListId(listId)
    setActiveSpaceId(spaceId)
  }

  function handleTaskCreated(task: unknown) {
    setTasks(prev => [task as TaskSummary, ...prev])
    // Refresh spaces to update task counts
    loadSpaces()
  }

  function handleTaskUpdated(id: string, data: Partial<TaskSummary>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
  }

  function handleTaskDeleted(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    loadSpaces()
  }

  async function handleDrop(taskId: string, newStatus: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return
    // Optimistic update — card moves instantly
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    // Persist to API
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: h(),
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {
      // Revert on failure
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t))
    })
  }

  // Breadcrumb
  const activeSpace = spaces.find(s => s.id === activeSpaceId || s.lists.some(l => l.id === activeListId) || s.folders.some(f => f.lists.some(l => l.id === activeListId)))
  const activeFolder = activeSpace?.folders.find(f => f.lists.some(l => l.id === activeListId))
  const activeList = activeSpace ? [...activeSpace.lists, ...activeSpace.folders.flatMap(f => f.lists)].find(l => l.id === activeListId) : null

  useEffect(() => {
    if (!token) return
    const params = new URLSearchParams()
    if (activeSpace?.id) params.set('spaceId', activeSpace.id)
    if (activeFolder?.id) params.set('folderId', activeFolder.id)
    if (activeListId) params.set('projectId', activeListId)
    fetch(`/api/tasks/custom-fields?${params}`, { headers: h() }).then(res => res.json()).then(data => setActiveCustomFields(data.fields ?? []))
  }, [token, activeSpace?.id, activeFolder?.id, activeListId, h])

  const filteredTasks = tasks
  const byStatus = (status: string) => filteredTasks.filter(t => t.status === status)
  const selectedClient = clients.find(client => client.id === filters.clientId)
  const activeFilterCount = Object.entries(filters).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)).length

  async function saveCurrentView() {
    const name = prompt('Nome desta visualização')?.trim()
    if (!name) return
    const isDefault = confirm('Usar esta visualização como padrão ao abrir Tarefas?')
    const res = await fetch('/api/tasks/views', { method: 'POST', headers: h(), body: JSON.stringify({ name, viewType: view, filters, scopeType: activeListId ? 'list' : activeSpaceId ? 'space' : 'workspace', scopeId: activeListId ?? activeSpaceId, isDefault }) })
    if (res.ok) { toast.success('Visualização salva'); loadConfiguration() }
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Tarefas" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-sm">Acesso restrito a administradores e gerentes.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Tarefas" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <SpaceNav
          spaces={spaces}
          activeListId={activeListId}
          onSelectList={handleSelectList}
          onRefresh={() => { loadSpaces(); loadTasks() }}
          token={token ?? ''}
          canEdit={canManage}
        />

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#1e1635] bg-[#0a0818] flex-shrink-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              {activeSpace ? (
                <>
                  <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ background: activeSpace.color }} />
                  <span className="font-medium text-slate-400">{activeSpace.name}</span>
                  {activeFolder && <><ChevronRight className="w-3 h-3" /><span>{activeFolder.name}</span></>}
                  {activeList && <><ChevronRight className="w-3 h-3" /><span className="font-medium text-white">{activeList.name}</span></>}
                </>
              ) : (
                <span className="font-medium text-slate-400">Todas as tarefas</span>
              )}
              <span className="ml-2 text-slate-700">· {filteredTasks.length} tarefas</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative hidden xl:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                <input value={filters.search} onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Buscar tarefas..." className="w-44 pl-8 pr-2 py-1.5 rounded-md bg-[#0f0b1e] border border-[#2d2550] text-xs text-slate-300 outline-none focus:border-purple-600" />
              </div>
              {savedViews.length > 0 && (
                <select aria-label="Visualizações salvas" onChange={e => {
                  const saved = savedViews.find(item => item.id === e.target.value)
                  if (saved) { setFilters({ ...EMPTY_FILTERS, ...(saved.filters ?? {}) }); setView(saved.viewType) }
                }} className="max-w-36 bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-1.5 text-xs text-slate-400 outline-none">
                  <option value="">Visualizações</option>
                  {savedViews.map(saved => <option key={saved.id} value={saved.id}>{saved.name}</option>)}
                </select>
              )}
              <button onClick={() => setFiltersOpen(open => !open)} title="Filtrar tarefas"
                className="relative w-8 h-8 rounded-md border border-[#2d2550] flex items-center justify-center text-slate-500 hover:text-white">
                <Filter className="w-3.5 h-3.5" />
                {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-purple-700 text-[9px] text-white flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              <button onClick={saveCurrentView} title="Salvar visualização" className="w-8 h-8 rounded-md border border-[#2d2550] flex items-center justify-center text-slate-500 hover:text-white"><BookmarkPlus className="w-3.5 h-3.5" /></button>
              {canManage && <button onClick={() => setSettingsOpen(true)} title="Configurar status e campos" className="w-8 h-8 rounded-md border border-[#2d2550] flex items-center justify-center text-slate-500 hover:text-white"><Settings2 className="w-3.5 h-3.5" /></button>}
              {/* View toggle */}
              <div className="flex items-center rounded-lg border border-[#2d2550] overflow-hidden">
                {(['board', 'list'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className="px-3 py-1.5 text-xs flex items-center gap-1.5 transition-all"
                    style={{ background: view === v ? 'rgba(106,17,203,0.2)' : 'transparent', color: view === v ? '#8b5cf6' : '#64748b' }}>
                    {v === 'board' ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
                    {v === 'board' ? 'Board' : 'Lista'}
                  </button>
                ))}
              </div>

              {canEdit && (
                <button onClick={() => { setCreateStatus('todo'); setCreateOpen(true) }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #6a11cb, #2575fc)' }}>
                  <Plus className="w-3.5 h-3.5" />
                  Nova tarefa
                </button>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div className="px-5 py-3 border-b border-[#1e1635] bg-[#0a0818] grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 flex-shrink-0">
              <input value={filters.search} onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))} placeholder="Nome ou descrição" className="xl:hidden bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2.5 py-2 text-xs text-slate-300 outline-none" />
              <select value={filters.assigneeId} onChange={e => setFilters(prev => ({ ...prev, assigneeId: e.target.value }))} className="bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-2 text-xs text-slate-400 outline-none">
                <option value="">Todos responsáveis</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <select value={filters.clientId} onChange={e => setFilters(prev => ({ ...prev, clientId: e.target.value, serviceKey: '' }))} className="bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-2 text-xs text-slate-400 outline-none">
                <option value="">Todos clientes</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              <select value={filters.serviceKey} onChange={e => setFilters(prev => ({ ...prev, serviceKey: e.target.value }))} disabled={!selectedClient} className="bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-2 text-xs text-slate-400 outline-none disabled:opacity-50">
                <option value="">Todos serviços</option>{selectedClient?.services.map(service => <option key={service.key} value={service.key}>{service.label}</option>)}
              </select>
              <select value={filters.priorities[0] ?? ''} onChange={e => setFilters(prev => ({ ...prev, priorities: e.target.value ? [e.target.value] : [] }))} className="bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-2 text-xs text-slate-400 outline-none">
                <option value="">Todas prioridades</option>{Object.entries(PRIO_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input type="date" title="Prazo inicial" value={filters.dueFrom} onChange={e => setFilters(prev => ({ ...prev, dueFrom: e.target.value }))} className="bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-2 text-xs text-slate-400 outline-none" style={{ colorScheme: 'dark' }} />
              <input type="date" title="Prazo final" value={filters.dueTo} onChange={e => setFilters(prev => ({ ...prev, dueTo: e.target.value }))} className="bg-[#0f0b1e] border border-[#2d2550] rounded-md px-2 py-2 text-xs text-slate-400 outline-none" style={{ colorScheme: 'dark' }} />
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="px-3 py-2 text-xs text-slate-500 hover:text-white border border-[#2d2550] rounded-md">Limpar</button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-[#6a11cb] animate-spin" />
            </div>
          ) : (
            <>
              {/* Board */}
              {view === 'board' && (
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-5">
                  <div className="flex gap-4 h-full" style={{ minWidth: 'max-content' }}>
                    {statuses.map(st => {
                      const isOver = dragOverStatus === st.key
                      return (
                        <div
                          key={st.key}
                          className="w-[300px] flex flex-col flex-shrink-0 rounded-xl transition-all duration-150"
                          style={isOver ? { background: statusBg(st.color), outline: `2px dashed ${st.color}60`, outlineOffset: '-2px' } : {}}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverStatus !== st.key) setDragOverStatus(st.key) }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null) }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const taskId = e.dataTransfer.getData('taskId')
                            if (taskId) handleDrop(taskId, st.key)
                            setDragOverStatus(null)
                            setDraggingTaskId(null)
                          }}
                        >
                          <div className="flex items-center justify-between mb-3 px-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: st.color }} />
                              <span className="text-xs font-semibold text-slate-300">{st.name}</span>
                              <span className="text-[10px] text-slate-600 bg-[#0f0b1e] px-1.5 py-0.5 rounded-full">{byStatus(st.key).length}</span>
                            </div>
                            {canEdit && (
                              <button onClick={() => { setCreateStatus(st.key); setCreateOpen(true) }}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-all">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
                            {byStatus(st.key).map(task => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                isDragging={draggingTaskId === task.id}
                                onDragStart={() => setDraggingTaskId(task.id)}
                                onDragEnd={() => { setDraggingTaskId(null); setDragOverStatus(null) }}
                                onClick={() => { if (!draggingTaskId) setSelectedTaskId(task.id) }}
                              />
                            ))}
                            {byStatus(st.key).length === 0 && (
                              <div
                                className="h-20 rounded-xl border border-dashed flex items-center justify-center transition-all"
                                style={{ borderColor: isOver ? st.color : '#1e1635', background: isOver ? statusBg(st.color) : 'transparent' }}
                              >
                                {!isOver && canEdit && (
                                  <button onClick={() => { setCreateStatus(st.key); setCreateOpen(true) }}
                                    className="text-[10px] text-slate-700 hover:text-slate-500 flex items-center gap-1 transition-all">
                                    <Plus className="w-3 h-3" /> Adicionar
                                  </button>
                                )}
                                {isOver && <span className="text-[10px]" style={{ color: st.color }}>Soltar aqui</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* List */}
              {view === 'list' && (
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="glass rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1e1635]">
                          {['Tarefa','Status','Prioridade','Responsáveis','Cliente','Serviço','Início','Prazo','Lista', ...activeCustomFields.map(field => field.name)].map(col => (
                            <th key={col} className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e1635]">
                        {filteredTasks.length === 0 && (
                          <tr><td colSpan={9 + activeCustomFields.length} className="px-4 py-8 text-center text-slate-600 text-sm">Nenhuma tarefa ainda. Crie a primeira!</td></tr>
                        )}
                        {filteredTasks.map(task => {
                          const st = statuses.find(s => s.key === task.status) ?? { key: task.status, name: task.status, color: '#64748b' }
                          const due = fmtDate(task.dueDate)
                          const start = fmtDate(task.startDate)
                          return (
                            <tr key={task.id} onClick={() => setSelectedTaskId(task.id)}
                              className="hover:bg-white/[0.02] cursor-pointer transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PRIO_COLORS[task.priority] }} />
                                  <span className="text-slate-200 font-medium truncate max-w-[200px]">{task.title}</span>
                                  {task.taskTags.slice(0,1).map(t => (
                                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full hidden md:inline"
                                      style={{ background: 'rgba(106,17,203,0.15)', color: '#8b5cf6' }}>{t}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-[10px] px-2 py-1 rounded-lg font-medium"
                                  style={{ background: statusBg(st.color), color: st.color }}>{st.name}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-[10px] font-medium" style={{ color: PRIO_COLORS[task.priority] }}>
                                  {PRIO_LABELS[task.priority]}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-400">{task.assignees?.map(item => item.userName).join(', ') || task.assigneeName || '—'}</td>
                              <td className="px-4 py-2.5 text-slate-400">{clients.find(client => client.id === task.clientWorkspaceId)?.name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-400">{clients.flatMap(client => client.services).find(service => service.key === task.serviceKey)?.label ?? '—'}</td>
                              <td className="px-4 py-2.5">{start ? <span style={{ color: start.color }}>{start.label}</span> : <span className="text-slate-700">—</span>}</td>
                              <td className="px-4 py-2.5">{due ? <span style={{ color: due.color }}>{due.label}</span> : <span className="text-slate-700">—</span>}</td>
                              <td className="px-4 py-2.5">
                                {task.project ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                    style={{ background: task.project.color + '22', color: task.project.color }}>
                                    {task.project.name}
                                  </span>
                                ) : <span className="text-slate-700">—</span>}
                              </td>
                              {activeCustomFields.map(field => {
                                const value = task.customFieldValues?.find(item => item.customFieldId === field.id)?.value
                                const display = field.type === 'client' ? clients.find(client => client.id === value)?.name : value
                                return <td key={field.id} className="px-4 py-2.5 text-slate-400 max-w-40 truncate">{display || '—'}</td>
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTaskId && (
        <TaskPanel
          taskId={selectedTaskId}
          spaces={spaces}
          members={members}
          statuses={statuses}
          clients={clients}
          token={token ?? ''}
          userName={user?.name ?? 'Usuário'}
          canManage={canManage}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* Create task modal */}
      {createOpen && (
        <CreateTaskModal
          spaces={spaces}
          members={members}
          statuses={statuses}
          clients={clients}
          initialStatus={createStatus}
          initialProjectId={activeListId ?? ''}
          token={token ?? ''}
          userName={user?.name ?? 'Usuário'}
          onCreated={handleTaskCreated}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {settingsOpen && (
        <TaskSettingsModal
          statuses={statuses}
          spaces={spaces}
          activeSpaceId={activeSpace?.id ?? null}
          activeFolderId={activeFolder?.id ?? null}
          activeProjectId={activeListId}
          token={token ?? ''}
          onChanged={() => { loadConfiguration(); loadSpaces() }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
