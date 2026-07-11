'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search, ChevronDown, Check, Building2, Sun, Moon, AlertTriangle, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/store/auth'
import { useTheme } from '@/lib/hooks/useTheme'
import type { WorkspaceInfo } from '@/lib/store/auth'

interface NotificationRow {
  id: string
  severity: string
  title: string
  message: string
  status: string
  createdAt: string
  workspace: { name: string }
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function WorkspaceRow({ ws, isCurrent, loading, onSwitch }: {
  ws: WorkspaceInfo; isCurrent: boolean; loading: boolean; onSwitch: (id: string) => void
}) {
  const ini = getInitials(ws.name)
  return (
    <button onClick={() => onSwitch(ws.id)} disabled={loading}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all hover:bg-white/[0.04]"
      style={isCurrent ? { background: 'rgba(245,163,20,0.06)' } : {}}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
        style={{ background: isCurrent ? 'linear-gradient(135deg, #6a11cb, #F5A314)' : ws.isAgency ? 'rgba(245,163,20,0.25)' : 'rgba(106,17,203,0.4)' }}
      >
        {ini}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isCurrent ? 'text-white' : 'text-slate-300'}`}>{ws.name}</p>
        <p className="text-[10px] text-slate-500">{ws.isAgency ? 'Agência' : (ws.segment ?? '')}</p>
      </div>
      {isCurrent && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F5A314' }} />}
    </button>
  )
}

export default function TopBar({ title, hideWorkspaceSwitcher }: { title: string; hideWorkspaceSwitcher?: boolean }) {
  const { user, token, currentWorkspace, accessibleWorkspaces, setAccessibleWorkspaces, switchWorkspace } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { theme, toggle } = useTheme()

  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.workspaces) setAccessibleWorkspaces(d.workspaces) })
      .catch(() => {})
  }, [token]) // eslint-disable-line

  useEffect(() => {
    if (!token) return
    function loadNotifications() {
      fetch('/api/notifications?unreadOnly=true', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (Array.isArray(d.notifications)) setNotifications(d.notifications) })
        .catch(() => {})
    }
    loadNotifications()
    const interval = setInterval(loadNotifications, 60_000)
    return () => clearInterval(interval)
  }, [token])

  async function markNotificationRead(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    } catch {}
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch('') }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) { setNotifOpen(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === currentWorkspace?.id) { setOpen(false); setSearch(''); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (res.ok) { switchWorkspace(data.token, data.workspace); setOpen(false); router.refresh() }
    } finally { setLoading(false) }
  }

  const agencyWorkspace = accessibleWorkspaces.find(w => w.isAgency)
  const clientWorkspaces = accessibleWorkspaces.filter(w => !w.isAgency)
  const q = search.toLowerCase()
  const filteredClients = q
    ? clientWorkspaces.filter(w => w.name.toLowerCase().includes(q) || w.segment?.toLowerCase().includes(q))
    : clientWorkspaces
  const initials = currentWorkspace ? getInitials(currentWorkspace.name) : '?'

  return (
    <header className="h-13 border-b border-[#1e1635] bg-[#0a0818] flex items-center justify-between px-4 flex-shrink-0 z-30 relative" style={{ minHeight: 52 }}>

      {/* Left: client selector */}
      <div className="flex items-center gap-3">
        {!hideWorkspaceSwitcher && clientWorkspaces.length > 0 && (
          <div ref={ref} className="relative flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Building2 className="w-3 h-3" />
              <span>Cliente:</span>
            </div>
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all"
              style={{
                background: open ? 'rgba(245,163,20,0.08)' : '#0f0b1e',
                borderColor: open ? '#F5A314' : '#2d2550',
              }}
            >
              {/* Avatar — identidade Carrossel (roxo/laranja) */}
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
              >
                {initials}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white leading-tight">{currentWorkspace?.name ?? 'Selecionar'}</p>
                {currentWorkspace?.segment && (
                  <p className="text-[10px] text-slate-500 leading-tight">{currentWorkspace.segment}</p>
                )}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {open && (
              <div className="absolute top-full left-0 mt-1.5 w-72 rounded-xl border border-[#2d2550] shadow-2xl z-[200] overflow-hidden"
                style={{ background: '#0d0a1f' }}
              >
                {/* Search */}
                <div className="px-3 pt-2.5 pb-2 border-b border-[#1e1635]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                      autoFocus
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar cliente..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
                    />
                  </div>
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                  {/* Agency workspace */}
                  {agencyWorkspace && (!search || agencyWorkspace.name.toLowerCase().includes(q)) && (
                    <>
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Agência</p>
                      </div>
                      <WorkspaceRow ws={agencyWorkspace} isCurrent={agencyWorkspace.id === currentWorkspace?.id} loading={loading} onSwitch={handleSwitch} />
                      {filteredClients.length > 0 && (
                        <div className="px-3 pt-2 pb-1 border-t border-[#1e1635] mt-1">
                          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Clientes</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Client workspaces */}
                  {filteredClients.length === 0 && search ? (
                    <p className="text-xs text-slate-500 text-center py-6">Nenhum resultado para "{search}"</p>
                  ) : (
                    filteredClients.map(ws => (
                      <WorkspaceRow key={ws.id} ws={ws} isCurrent={ws.id === currentWorkspace?.id} loading={loading} onSwitch={handleSwitch} />
                    ))
                  )}
                </div>

                <div className="px-3 py-2 border-t border-[#1e1635]">
                  <button className="text-[10px] text-slate-500 hover:text-[#F5A314] transition-colors">
                    + Adicionar novo cliente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <h1 className="text-sm font-semibold text-white">{title}</h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          <span className="hidden md:inline">Ao vivo</span>
        </div>
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input type="text" placeholder="Buscar métricas..."
            className="w-44 pl-8 pr-3 py-1.5 text-xs bg-[#1e1635] border border-[#2d2550] rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none transition-colors"
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#F5A314'}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#2d2550'}
          />
        </div>
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-lg bg-[#1e1635] border border-[#2d2550] flex items-center justify-center text-slate-400 hover:text-[#F5A314] hover:border-[#F5A314]/50 transition-all"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="w-8 h-8 rounded-lg bg-[#1e1635] border border-[#2d2550] flex items-center justify-center text-slate-400 hover:text-[#F5A314] hover:border-[#F5A314]/50 transition-all relative"
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: '#ef4444' }}>
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-80 rounded-xl border border-[#2d2550] shadow-2xl z-[200] overflow-hidden"
              style={{ background: '#0d0a1f' }}
            >
              <div className="px-3.5 py-2.5 border-b border-[#1e1635]">
                <p className="text-xs font-semibold text-white">Notificações</p>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma notificação nova</p>
                ) : (
                  notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => markNotificationRead(n.id)}
                      className="w-full flex items-start gap-2.5 px-3.5 py-3 text-left border-b border-[#1e1635] hover:bg-white/[0.03] transition-all"
                    >
                      {n.severity === 'critical' ? (
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white">{n.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{n.workspace.name}</p>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                        {n.status === 'resolved' && (
                          <p className="text-[10px] text-emerald-400 mt-1">Resolvido</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }} title={user?.name}
        >
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  )
}
