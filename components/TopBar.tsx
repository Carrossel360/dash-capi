'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Bell, Search, ChevronDown, Check, Sun, Moon, AlertTriangle, AlertCircle, Menu, Settings2, Camera, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/auth'
import { useUIStore } from '@/lib/store/ui'
import { useTheme } from '@/lib/hooks/useTheme'
import type { WorkspaceInfo } from '@/lib/store/auth'
import { defaultRouteForRole, ATTENDANT_ALLOWED_HREFS } from '@/lib/roleAccess'

interface NotificationRow {
  id: string
  workspaceId: string
  severity: string
  title: string
  message: string
  link: string | null
  status: string
  createdAt: string
  type: string
  metadata?: { sound?: boolean } | null
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
  const { user, token, currentWorkspace, accessibleWorkspaces, setAccessibleWorkspaces, switchWorkspace, updateUser } = useAuthStore()
  const { toggleMobileNav } = useUIStore()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switcherSearch, setSwitcherSearch] = useState('')
  const switcherRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const knownNotificationIds = useRef<Set<string> | null>(null)

  function playNotificationSound() {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return
      const context = new AudioContextClass()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.setValueAtTime(740, context.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12)
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2)
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.start(); oscillator.stop(context.currentTime + 0.21)
    } catch { /* browser may require a prior user interaction */ }
  }

  // Perfil (canto superior direito) — qualquer pessoa logada, cliente ou agência, troca a
  // própria foto por aqui. Usa a mesma rota de avatar já usada em Configurações > Equipe
  // (lá é admin editando qualquer membro; aqui é sempre a própria conta, sempre permitido).
  const [profileOpen, setProfileOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`/api/workspace/members/${user.id}/avatar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataUrl }),
      })
      const data = await res.json()
      if (res.ok) { updateUser({ avatarUrl: data.avatarUrl }); toast.success('Foto atualizada') }
      else toast.error('Erro ao enviar foto')
    } catch {
      toast.error('Erro ao enviar foto')
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

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
        .then(d => {
          if (!Array.isArray(d.notifications)) return
          const next = d.notifications as NotificationRow[]
          if (knownNotificationIds.current) {
            const shouldPlay = next.some(item => !knownNotificationIds.current?.has(item.id) && item.type.startsWith('task_') && item.metadata?.sound !== false)
            if (shouldPlay) playNotificationSound()
          }
          knownNotificationIds.current = new Set(next.map(item => item.id))
          setNotifications(next)
        })
        .catch(() => {})
    }
    loadNotifications()
    const interval = setInterval(loadNotifications, 60_000)
    return () => clearInterval(interval)
  }, [token])

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === currentWorkspace?.id) { setSwitcherOpen(false); setSwitcherSearch(''); return }
    setSwitching(true)
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (res.ok) {
        switchWorkspace(data.token, data.workspace)
        setSwitcherOpen(false)
        setSwitcherSearch('')
        // Atendente só vê CRM Pipeline/Conversas no menu — se a página atual não é uma
        // dessas duas rotas, manda pra rota permitida em vez de deixar numa tela órfã do menu.
        const isRestrictedAttendant = !data.workspace?.isAgency && data.workspace?.role === 'attendant'
        if (isRestrictedAttendant && !ATTENDANT_ALLOWED_HREFS.includes(pathname)) {
          router.push(defaultRouteForRole(data.workspace))
        } else {
          router.refresh()
        }
      }
    } finally { setSwitching(false) }
  }

  async function markNotificationRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    } catch {}
  }

  async function handleNotificationClick(n: NotificationRow) {
    markNotificationRead(n.id) // background — some da lista sozinha no próximo poll, não na hora
    setNotifOpen(false)

    // Notificação é sempre sobre um cliente específico — troca pro workspace dele antes de
    // navegar, senão o link abre a página certa mas com os dados do cliente errado (o que
    // estiver selecionado no momento).
    if (n.workspaceId !== currentWorkspace?.id) {
      try {
        const res = await fetch('/api/auth/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ workspaceId: n.workspaceId }),
        })
        const data = await res.json()
        if (res.ok) switchWorkspace(data.token, data.workspace)
      } catch { /* segue pro link mesmo assim, com o workspace atual */ }
    }

    if (n.link) router.push(n.link)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) { setSwitcherOpen(false); setSwitcherSearch('') }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) { setNotifOpen(false) }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) { setProfileOpen(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isAgencyStaffUser = accessibleWorkspaces.some(w => w.isAgency)
  const initials = currentWorkspace ? getInitials(currentWorkspace.name) : '?'
  const agencyWorkspace = accessibleWorkspaces.find(w => w.isAgency)
  const clientWorkspaces = accessibleWorkspaces.filter(w => !w.isAgency)
  const switcherQuery = switcherSearch.toLowerCase()
  const filteredClientWorkspaces = switcherQuery
    ? clientWorkspaces.filter(w => w.name.toLowerCase().includes(switcherQuery) || w.segment?.toLowerCase().includes(switcherQuery))
    : clientWorkspaces
  // "Modo cliente" (currentWorkspace.isAgency === false) mostra o nome do cliente — no painel
  // da própria agência fica escondido. O seletor (dropdown pra trocar de cliente sem passar
  // pela Sidebar) só aparece se houver outros clientes acessíveis pra essa pessoa; o ícone de
  // engrenagem (atalho pras configurações daquele cliente) continua só pra equipe da agência.
  const inClientContext = !hideWorkspaceSwitcher && currentWorkspace?.isAgency === false
  const showSwitcher = inClientContext && clientWorkspaces.length > 0

  return (
    <header className="h-13 border-b border-[#1e1635] bg-[#0a0818] flex items-center justify-between px-4 flex-shrink-0 z-30 relative" style={{ minHeight: 52 }}>

      {/* Left: nome do cliente (modo cliente) ou título da página (modo agência) */}
      <div className="flex items-center gap-3">
        <button onClick={toggleMobileNav}
          className="md:hidden w-8 h-8 rounded-lg bg-[#1e1635] border border-[#2d2550] flex items-center justify-center text-slate-400 hover:text-white flex-shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>
        {inClientContext ? (
          <div className="flex items-center gap-2">
            {showSwitcher ? (
              <div ref={switcherRef} className="relative">
                <button
                  onClick={() => setSwitcherOpen(o => !o)}
                  className="flex items-center gap-2 px-2 py-1 -ml-2 rounded-lg transition-all hover:bg-white/[0.04]"
                >
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
                  >
                    {initials}
                  </div>
                  <h1 className="text-sm font-semibold text-white">{currentWorkspace?.name}</h1>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform flex-shrink-0 ${switcherOpen ? 'rotate-180' : ''}`} />
                </button>

                {switcherOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-72 rounded-xl border border-[#2d2550] shadow-2xl z-[200] overflow-hidden theme-locked-modal"
                    style={{ background: '#0d0a1f' }}
                  >
                    <div className="px-3 pt-2.5 pb-2 border-b border-[#1e1635]">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                        <input
                          autoFocus
                          value={switcherSearch}
                          onChange={e => setSwitcherSearch(e.target.value)}
                          placeholder="Buscar cliente..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
                        />
                      </div>
                    </div>

                    <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                      {agencyWorkspace && (!switcherQuery || agencyWorkspace.name.toLowerCase().includes(switcherQuery)) && (
                        <>
                          <div className="px-3 pt-2 pb-1">
                            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Agência</p>
                          </div>
                          <WorkspaceRow ws={agencyWorkspace} isCurrent={agencyWorkspace.id === currentWorkspace?.id} loading={switching} onSwitch={handleSwitch} />
                          {filteredClientWorkspaces.length > 0 && (
                            <div className="px-3 pt-2 pb-1 border-t border-[#1e1635] mt-1">
                              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Clientes</p>
                            </div>
                          )}
                        </>
                      )}

                      {filteredClientWorkspaces.length === 0 && switcherSearch ? (
                        <p className="text-xs text-slate-500 text-center py-6">Nenhum resultado para "{switcherSearch}"</p>
                      ) : (
                        filteredClientWorkspaces.map(ws => (
                          <WorkspaceRow key={ws.id} ws={ws} isCurrent={ws.id === currentWorkspace?.id} loading={switching} onSwitch={handleSwitch} />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
                >
                  {initials}
                </div>
                <h1 className="text-sm font-semibold text-white">{currentWorkspace?.name}</h1>
              </div>
            )}
            {isAgencyStaffUser && currentWorkspace?.id && (
              <button onClick={() => router.push(`/clientes/${currentWorkspace.id}`)}
                title="Configurações deste cliente"
                className="w-7 h-7 rounded-lg border border-[#2d2550] flex items-center justify-center text-slate-500 hover:text-white hover:border-[#6a11cb]/50 transition-all flex-shrink-0"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <h1 className="text-sm font-semibold text-white">{title}</h1>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5">
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
            <div className="absolute top-full right-0 mt-1.5 w-80 rounded-xl border border-[#2d2550] shadow-2xl z-[200] overflow-hidden theme-locked-modal"
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
                      onClick={() => handleNotificationClick(n)}
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
                        {n.link && (
                          <p className="text-[10px] mt-1" style={{ color: '#F5A314' }}>Clique para abrir →</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={profileRef} className="relative">
          <button onClick={() => setProfileOpen(o => !o)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold cursor-pointer overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }} title={user?.name}
          >
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              : (user?.name?.[0]?.toUpperCase() ?? 'U')}
          </button>

          {profileOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-64 rounded-xl border border-[#2d2550] shadow-2xl z-[200] overflow-hidden p-4 theme-locked-modal"
              style={{ background: '#0d0a1f' }}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="relative w-16 h-16 group/profileavatar">
                  <div onClick={() => avatarInputRef.current?.click()}
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
                  >
                    {uploadingAvatar ? <Loader2 className="w-5 h-5 animate-spin" /> : user?.avatarUrl
                      ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                      : (user?.name?.[0]?.toUpperCase() ?? 'U')}
                  </div>
                  {!uploadingAvatar && (
                    <div onClick={() => avatarInputRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/profileavatar:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{user?.name}</p>
                  <p className="text-[10px] text-slate-500">{user?.email}</p>
                </div>
                <button onClick={() => avatarInputRef.current?.click()}
                  className="text-[10px] text-slate-500 hover:text-[#F5A314] transition-colors">
                  Trocar foto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
