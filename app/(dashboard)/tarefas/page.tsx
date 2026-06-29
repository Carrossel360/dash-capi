'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Plus, ChevronRight, ChevronDown, LayoutGrid, List, Settings2,
  Folder, FolderOpen, CheckSquare, Loader2, MoreHorizontal, Trash2,
  X, Hash,
} from 'lucide-react'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'
import CreateTaskModal from './CreateTaskModal'
import TaskPanel from './TaskPanel'
import type { TaskSpace, Member } from './CreateTaskModal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskSummary {
  id: string; title: string; status: string; priority: string
  assigneeId: string | null; assigneeName: string | null
  startDate: string | null; dueDate: string | null
  projectId: string | null; taskTags: string[]
  project: { id: string; name: string; color: string } | null
  _count: { comments: number; subtasks: number }
}

const STATUSES = [
  { key: 'todo',        label: 'A Fazer',      color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  { key: 'in_progress', label: 'Em Progresso', color: '#2575fc', bg: 'rgba(37,117,252,0.12)'  },
  { key: 'in_review',   label: 'Em Revisão',   color: '#F5A314', bg: 'rgba(245,163,20,0.12)'  },
  { key: 'done',        label: 'Concluído',     color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
]
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

const SPACE_COLORS = ['#6a11cb','#2575fc','#10b981','#F5A314','#ef4444','#ec4899','#06b6d4','#84cc16']

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
  const [colorPick, setColorPick] = useState(SPACE_COLORS[0])
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
    await fetch('/api/tasks/spaces', { method: 'POST', headers: h, body: JSON.stringify({ name: nameInput.trim(), color: colorPick }) })
    setCreating(null); setNameInput(''); onRefresh()
  }

  async function createFolder(spaceId: string) {
    if (!nameInput.trim()) return
    await fetch('/api/tasks/folders', { method: 'POST', headers: h, body: JSON.stringify({ spaceId, name: nameInput.trim() }) })
    setCreating(null); setNameInput(''); onRefresh()
  }

  async function createList(spaceId: string, folderId?: string) {
    if (!nameInput.trim()) return
    await fetch('/api/tasks/projects', { method: 'POST', headers: h, body: JSON.stringify({ name: nameInput.trim(), color: colorPick, spaceId, folderId: folderId ?? null }) })
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
        {(creating?.type === 'space' || creating?.type === 'list') && (
          <div className="flex gap-1 mb-2">
            {SPACE_COLORS.map(c => (
              <button key={c} onClick={() => setColorPick(c)}
                className="w-4 h-4 rounded-full transition-all"
                style={{ background: c, outline: colorPick === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        )}
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
                onClick={() => setExpanded(prev => ({ ...prev, [space.id]: !prev[space.id] }))}>
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
  const canEdit = ['admin', 'manager'].includes(role)

  const [spaces, setSpaces]   = useState<TaskSpace[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks]     = useState<TaskSummary[]>([])
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

  const loadTasks = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = activeListId ? `?projectId=${activeListId}` : activeSpaceId ? `?spaceId=${activeSpaceId}` : ''
      const [tRes, mRes] = await Promise.all([
        fetch(`/api/tasks${params}`, { headers: h() }),
        fetch('/api/workspace/members', { headers: h() }),
      ])
      const [td, md] = await Promise.all([tRes.json(), mRes.json()])
      setTasks(td.tasks ?? [])
      setMembers(md.members ?? [])
    } finally { setLoading(false) }
  }, [token, activeListId, activeSpaceId, h])

  useEffect(() => { loadSpaces() }, [loadSpaces])
  useEffect(() => { loadTasks() }, [loadTasks])

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

  const filteredTasks = tasks
  const byStatus = (status: string) => filteredTasks.filter(t => t.status === status)

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
          canEdit={canEdit}
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
                    {STATUSES.map(st => {
                      const isOver = dragOverStatus === st.key
                      return (
                        <div
                          key={st.key}
                          className="w-[300px] flex flex-col flex-shrink-0 rounded-xl transition-all duration-150"
                          style={isOver ? { background: st.bg, outline: `2px dashed ${st.color}60`, outlineOffset: '-2px' } : {}}
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
                              <span className="text-xs font-semibold text-slate-300">{st.label}</span>
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
                                style={{ borderColor: isOver ? st.color : '#1e1635', background: isOver ? st.bg : 'transparent' }}
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
                          {['Tarefa','Status','Prioridade','Responsável','Início','Prazo','Lista'].map(col => (
                            <th key={col} className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e1635]">
                        {filteredTasks.length === 0 && (
                          <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-600 text-sm">Nenhuma tarefa ainda. Crie a primeira!</td></tr>
                        )}
                        {filteredTasks.map(task => {
                          const st = STATUSES.find(s => s.key === task.status) ?? STATUSES[0]
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
                                  style={{ background: st.bg, color: st.color }}>{st.label}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-[10px] font-medium" style={{ color: PRIO_COLORS[task.priority] }}>
                                  {PRIO_LABELS[task.priority]}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-400">{task.assigneeName ?? '—'}</td>
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
          token={token ?? ''}
          userName={user?.name ?? 'Usuário'}
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
          initialStatus={createStatus}
          initialProjectId={activeListId ?? ''}
          token={token ?? ''}
          userName={user?.name ?? 'Usuário'}
          onCreated={handleTaskCreated}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
