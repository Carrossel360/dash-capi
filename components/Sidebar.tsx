'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, Share2, MapPin,
  Users, Megaphone, MessageSquare, Zap, Settings, Building2,
  ChevronLeft, ChevronRight, LogOut, Lock, CheckSquare, Bot, Landmark, Sparkles, Smartphone,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store/auth'
import { useUIStore } from '@/lib/store/ui'
import LockedServiceModal from '@/components/LockedServiceModal'
import ComingSoonModal from '@/components/ComingSoonModal'
import { ATTENDANT_ALLOWED_HREFS } from '@/lib/roleAccess'

type ServiceKey = 'trafeqoPago' | 'socialMedia' | 'googleBusiness' | 'googleLocal' | 'contentStudio'

// Dois modos de navegação distintos (não é mais um único menu com flags cruzadas):
// `context: 'agency'` — só aparece no painel da própria Carrossel (currentWorkspace.isAgency),
// a "tela inicial" do admin: Visão Geral (da agência), Clientes, Tarefas, Configurações.
// `context: 'client'` — só aparece depois de entrar num cliente específico (!isAgency):
// Relatórios, CRM, Rastreamento, Criação — o mesmo conjunto pro admin navegando um cliente e
// pro próprio usuário daquele cliente. Pra ver Tráfego Pago/Social/Pipeline/etc da própria
// Carrossel, ela é cadastrada como cliente normal (ver Workspace.isAgencyInternal).
// `agencyOnly`: dentro do contexto 'client', restringe a item visível só pro staff da agência
// (não pro usuário final do cliente) — hoje Relatórios com IA e Eventos CAPI.
// `comingSoon`: aparece no menu do cliente, mas ao clicar mostra "ainda não disponível" em vez
// de navegar — usado em telas que hoje são só placeholder.
const navGroups = [
  {
    label: 'Visão Geral',
    context: 'agency' as const,
    items: [
      { label: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
    ],
  },
  {
    label: 'Agência',
    context: 'agency' as const,
    items: [
      { label: 'Clientes', href: '/clientes', icon: Building2, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
    ],
  },
  {
    label: 'Tarefas',
    context: 'agency' as const,
    items: [
      { label: 'Operacional', href: '/tarefas', icon: CheckSquare, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Criação', href: '/tarefas/criacao', icon: Sparkles, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
    ],
  },
  {
    label: 'BPO',
    context: 'agency' as const,
    items: [
      // Placeholder "em breve" (DRE/DFC, Contas a Pagar x Receber, Agente Financeiro) — sem
      // dado vinculado ainda, per mapa mental (referência de mercado: Organify).
      { label: 'BPO Financeiro', href: '/bpo', icon: Landmark, service: null, adminOnly: false, agencyOnly: false, comingSoon: true },
    ],
  },
  {
    label: 'Relatórios',
    context: 'client' as const,
    items: [
      { label: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Tráfego Pago', href: '/trafego-pago', icon: TrendingUp, service: 'trafeqoPago' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Social Media', href: '/social-media', icon: Share2, service: 'socialMedia' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Google Business', href: '/google-business', icon: MapPin, service: 'googleBusiness' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Relatórios com IA', href: '/relatorios-ia', icon: Bot, service: 'trafeqoPago' as ServiceKey, adminOnly: false, agencyOnly: true, comingSoon: false },
    ],
  },
  {
    label: 'CRM',
    context: 'client' as const,
    items: [
      { label: 'Campanhas', href: '/campanhas', icon: Megaphone, service: null, adminOnly: false, agencyOnly: false, comingSoon: true },
      { label: 'Pipeline', href: '/pipeline', icon: Users, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Conversas', href: '/conversas', icon: MessageSquare, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
    ],
  },
  {
    label: 'Rastreamento',
    context: 'client' as const,
    items: [
      { label: 'Eventos CAPI', href: '/events', icon: Zap, service: null, adminOnly: false, agencyOnly: true, comingSoon: false },
      // Reconectar/gerar QR Code — visível pro cliente também (não agencyOnly). A tela em si
      // (app/(dashboard)/whatsapp/page.tsx) só mostra status + botão, nada de config admin.
      { label: 'WhatsApp', href: '/whatsapp', icon: Smartphone, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
    ],
  },
]

// Únicos itens visíveis pro papel "atendente" num workspace de cliente — vê só o
// operacional do dia a dia (CRM + conversas), nada de métricas/configuração/áreas em construção.
// Únicos itens visíveis pro lado Equipe (staff da agência sem papel de gestão — Visualizador/
// Operador): só Tarefas, escopado por espaço (TaskSpaceMember, ver Fase C4).
const EQUIPE_ALLOWED_HREFS = ['/tarefas']

const SERVICE_LABELS: Record<ServiceKey, string> = {
  trafeqoPago: 'Tráfego Pago',
  socialMedia: 'Social Media',
  googleBusiness: 'Google Business Profile',
  googleLocal: 'Local Service',
  contentStudio: 'Estúdio de Criação (IA)',
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [lockedService, setLockedService] = useState<ServiceKey | null>(null)
  const [comingSoonLabel, setComingSoonLabel] = useState<string | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const pathname = usePathname()
  const { user, token, logout, currentWorkspace, accessibleWorkspaces, switchWorkspace } = useAuthStore()
  const { mobileNavOpen, closeMobileNav } = useUIStore()
  const router = useRouter()
  const [switchingHome, setSwitchingHome] = useState(false)

  // Clear optimistic active when pathname settles
  useEffect(() => { setPendingHref(null) }, [pathname])

  function handleLogout() {
    logout()
    document.documentElement.removeAttribute('data-theme') // login é sempre escuro
    router.push('/login')
  }

  // Clicar no logo/nome da agência volta pro painel dela — mesmo mecanismo do switcher do
  // TopBar (POST /api/auth/switch), só que sempre alvo o workspace isAgency:true da pessoa.
  async function handleGoHome() {
    if (currentWorkspace?.isAgency) { router.push('/dashboard'); return }
    const agencyWorkspace = accessibleWorkspaces.find(w => w.isAgency)
    if (!agencyWorkspace) return
    setSwitchingHome(true)
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: agencyWorkspace.id }),
      })
      const data = await res.json()
      if (res.ok) {
        switchWorkspace(data.token, data.workspace)
        closeMobileNav()
        router.push('/dashboard')
      }
    } finally { setSwitchingHome(false) }
  }

  const isAgency = currentWorkspace?.isAgency ?? true
  const isViewer = currentWorkspace?.role === 'viewer'
  const isAttendant = !isAgency && currentWorkspace?.role === 'attendant'
  const canManage = ['admin', 'manager'].includes(currentWorkspace?.role ?? '')
  const services = currentWorkspace?.services

  // "É da equipe Carrossel" independe do workspace selecionado no momento — a pessoa pode
  // estar navegando dentro de um cliente e continuar sendo staff (mesma lógica de
  // lib/auth.ts:isAgencyStaff, versão client-side usando a lista já carregada no switcher).
  const isAgencyStaffUser = accessibleWorkspaces.some(w => w.isAgency)
  // Acesso Equipe (item 12): staff sem papel de gestão (Visualizador/Operador) — só vê Tarefas.
  const isEquipe = isAgencyStaffUser && !canManage

  function isServiceLocked(service: ServiceKey | null): boolean {
    if (!service) return false
    if (isAgency) return false
    if (!isViewer) return false
    // "Tráfego Pago" é uma rota só, mas cobre três serviços contratáveis separadamente
    // (Meta Ads / Google Ads / Google Local Service, aninhado em abas) — só bloqueia a
    // rota inteira se o cliente não tiver nenhum dos três.
    if (service === 'trafeqoPago') return !(services?.metaAds || services?.googleAds || services?.googleLocal)
    return !(services?.[service] ?? false)
  }

  function handleNavClick(e: React.MouseEvent, href: string, service: ServiceKey | null, comingSoon: boolean, label: string) {
    if (comingSoon) {
      e.preventDefault()
      setComingSoonLabel(label)
      return
    }
    if (service && isServiceLocked(service)) {
      e.preventDefault()
      setLockedService(service)
      return
    }
    setPendingHref(href)
    closeMobileNav()
  }

  return (
    <>
      {/* Backdrop — só no mobile, quando o drawer está aberto */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={closeMobileNav} />
      )}

      <aside className={`sidebar-transition flex flex-col h-screen bg-[#0a0818] border-r border-[#1e1635] z-40 flex-shrink-0 fixed md:relative inset-y-0 left-0 transition-transform duration-200 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${collapsed ? 'w-14' : 'w-56'}`}>

        {/* Logo — clicar volta pro painel da agência */}
        <button onClick={handleGoHome} disabled={switchingHome} title={collapsed ? 'Painel da agência' : undefined}
          className="flex items-center gap-2.5 px-3 py-3 border-b border-[#1e1635] hover:bg-white/[0.03] transition-colors text-left disabled:opacity-60">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ boxShadow: '0 0 10px rgba(245,163,20,0.3)' }}>
            <Image src="/logo-c360.png" alt="Carrossel 360" width={32} height={32} className="w-full h-full object-cover rounded-full" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-[10px] text-slate-400 font-medium">Sistema Orbital</p>
              <p className="text-xs font-bold" style={{ color: '#F5A314' }}>CARROSSEL 360</p>
            </div>
          )}
        </button>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {navGroups.map((group) => {
            if (group.context !== (isAgency ? 'agency' : 'client')) return null
            const visibleItems = group.items
              .filter(item => !item.adminOnly || canManage)
              .filter(item => !item.agencyOnly || isAgencyStaffUser)
              .filter(item => !isAttendant || ATTENDANT_ALLOWED_HREFS.includes(item.href))
              .filter(item => !isEquipe || EQUIPE_ALLOWED_HREFS.includes(item.href))
            if (visibleItems.length === 0) return null
            return (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <p className="px-3.5 mb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">{group.label}</p>
              )}
              <div className="space-y-0.5 px-2">
                {visibleItems.map(({ label, href, icon: Icon, service, comingSoon }) => {
                  const active = (pendingHref ?? pathname) === href
                  const willShowComingSoon = comingSoon
                  const locked = willShowComingSoon || isServiceLocked(service)
                  return (
                    <Link key={href} href={href} title={collapsed ? label : undefined}
                      onClick={(e) => handleNavClick(e, href, service, comingSoon, label)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 group
                        ${active ? 'text-white' : locked ? 'text-slate-600 cursor-pointer' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                      style={active ? {
                        background: 'linear-gradient(135deg, rgba(245,163,20,0.15) 0%, rgba(106,17,203,0.15) 100%)',
                        border: '1px solid rgba(245,163,20,0.3)',
                      } : {}}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: active ? '#F5A314' : locked ? '#2d2550' : undefined }} />
                      {!collapsed && <span className="truncate flex-1">{label}</span>}
                      {!collapsed && locked && <Lock className="w-3 h-3 text-slate-700 flex-shrink-0" />}
                    </Link>
                  )
                })}
              </div>
            </div>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-[#1e1635] space-y-0.5">
          {isAgency && isAgencyStaffUser && !isEquipe && (
            <Link href="/settings" title={collapsed ? 'Configurações' : undefined}
              onClick={() => setPendingHref('/settings')}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all group
                ${(pendingHref ?? pathname) === '/settings' ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              style={(pendingHref ?? pathname) === '/settings' ? {
                background: 'linear-gradient(135deg, rgba(245,163,20,0.15) 0%, rgba(106,17,203,0.15) 100%)',
                border: '1px solid rgba(245,163,20,0.3)',
              } : {}}
            >
              <Settings className="w-3.5 h-3.5 flex-shrink-0" style={{ color: (pendingHref ?? pathname) === '/settings' ? '#F5A314' : undefined }} />
              {!collapsed && <span>Configurações</span>}
            </Link>
          )}

          {!collapsed && user && (
            <div className="px-2.5 py-2">
              <p className="text-xs text-white font-medium truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          )}

          <button onClick={handleLogout} title={collapsed ? 'Sair' : undefined}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>

        {/* Collapse toggle — só desktop; no mobile o drawer é aberto/fechado, não colapsado */}
        <button onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3 top-5 w-5 h-5 rounded-full border items-center justify-center transition-all z-30"
          style={{ background: '#0a0818', borderColor: '#2d2550', color: '#64748b' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#F5A314'; (e.currentTarget as HTMLElement).style.color = '#F5A314'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2d2550'; (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {lockedService && (
        <LockedServiceModal label={SERVICE_LABELS[lockedService]} onClose={() => setLockedService(null)} />
      )}
      {comingSoonLabel && (
        <ComingSoonModal label={comingSoonLabel} onClose={() => setComingSoonLabel(null)} />
      )}
    </>
  )
}
