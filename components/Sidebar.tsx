'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, Share2, MapPin, Star,
  Users, Megaphone, MessageSquare, Zap, Settings, Building2,
  ChevronLeft, ChevronRight, LogOut, Lock, CheckSquare, Sparkles, Bot,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store/auth'
import LockedServiceModal from '@/components/LockedServiceModal'
import ComingSoonModal from '@/components/ComingSoonModal'

type ServiceKey = 'trafeqoPago' | 'socialMedia' | 'googleBusiness' | 'googleLocal' | 'contentStudio'

// `agencyOnly`: some do menu inteiro pra qualquer papel de workspace de cliente (não é sobre
// serviço contratado, é área que só faz sentido pra agência gerenciar).
// `comingSoon`: aparece no menu do cliente, mas ao clicar mostra "ainda não disponível" em vez
// de navegar — usado em telas que hoje são só placeholder ("Em Breve") ou que ainda não
// abrimos pra uso do cliente, independente de plano contratado.
const navGroups = [
  {
    label: 'Relatórios',
    items: [
      { label: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Tráfego Pago', href: '/trafego-pago', icon: TrendingUp, service: 'trafeqoPago' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Social Media', href: '/social-media', icon: Share2, service: 'socialMedia' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Google Business', href: '/google-business', icon: MapPin, service: 'googleBusiness' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Google Local', href: '/google-local', icon: Star, service: 'googleLocal' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: true },
      { label: 'Relatórios com IA', href: '/relatorios-ia', icon: Bot, service: 'trafeqoPago' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: false },
    ],
  },
  {
    label: 'Criação',
    items: [
      { label: 'Content Studio', href: '/content-studio', icon: Sparkles, service: 'contentStudio' as ServiceKey, adminOnly: false, agencyOnly: false, comingSoon: true },
    ],
  },
  {
    label: 'Automação',
    items: [
      { label: 'Campanhas', href: '/campanhas', icon: Megaphone, service: null, adminOnly: false, agencyOnly: false, comingSoon: true },
      { label: 'CRM Pipeline', href: '/pipeline', icon: Users, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Conversas', href: '/conversas', icon: MessageSquare, service: null, adminOnly: false, agencyOnly: false, comingSoon: false },
      { label: 'Tarefas', href: '/tarefas', icon: CheckSquare, service: null, adminOnly: true, agencyOnly: true, comingSoon: false },
    ],
  },
  {
    label: 'Rastreamento',
    items: [
      { label: 'Eventos CAPI', href: '/events', icon: Zap, service: null, adminOnly: false, agencyOnly: true, comingSoon: false },
    ],
  },
  {
    label: 'Agência',
    items: [
      { label: 'Clientes', href: '/clientes', icon: Building2, service: null, adminOnly: false, agencyOnly: true, comingSoon: false },
    ],
  },
]

// Únicos itens visíveis pro papel "atendente" num workspace de cliente — vê só o
// operacional do dia a dia (CRM + conversas), nada de métricas/configuração/áreas em construção.
const ATTENDANT_ALLOWED_HREFS = ['/pipeline', '/conversas']

const SERVICE_LABELS: Record<ServiceKey, string> = {
  trafeqoPago: 'Tráfego Pago',
  socialMedia: 'Social Media',
  googleBusiness: 'Google Business Profile',
  googleLocal: 'Google Local Service',
  contentStudio: 'Content Studio (IA)',
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [lockedService, setLockedService] = useState<ServiceKey | null>(null)
  const [comingSoonLabel, setComingSoonLabel] = useState<string | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const pathname = usePathname()
  const { user, logout, currentWorkspace } = useAuthStore()
  const router = useRouter()

  // Clear optimistic active when pathname settles
  useEffect(() => { setPendingHref(null) }, [pathname])

  function handleLogout() { logout(); router.push('/login') }

  const isAgency = currentWorkspace?.isAgency ?? true
  const isViewer = currentWorkspace?.role === 'viewer'
  const isAttendant = !isAgency && currentWorkspace?.role === 'attendant'
  const canManage = ['admin', 'manager'].includes(currentWorkspace?.role ?? '')
  const services = currentWorkspace?.services

  function isServiceLocked(service: ServiceKey | null): boolean {
    if (!service) return false
    if (isAgency) return false
    if (!isViewer) return false
    // "Tráfego Pago" é uma rota só, mas cobre dois serviços contratáveis separadamente
    // (Meta Ads / Google Ads) — só bloqueia a rota inteira se o cliente não tiver nenhum dos dois.
    if (service === 'trafeqoPago') return !(services?.metaAds || services?.googleAds)
    return !(services?.[service] ?? false)
  }

  function handleNavClick(e: React.MouseEvent, href: string, service: ServiceKey | null, comingSoon: boolean, label: string) {
    if (comingSoon && !isAgency) {
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
  }

  return (
    <>
      <aside className={`sidebar-transition flex flex-col h-screen bg-[#0a0818] border-r border-[#1e1635] relative z-20 flex-shrink-0 ${collapsed ? 'w-14' : 'w-56'}`}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[#1e1635]">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ boxShadow: '0 0 10px rgba(245,163,20,0.3)' }}>
            <Image src="/logo-c360.png" alt="Carrossel 360" width={32} height={32} className="w-full h-full object-cover rounded-full" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-[10px] text-slate-400 font-medium">Central do Cliente</p>
              <p className="text-xs font-bold" style={{ color: '#F5A314' }}>CARROSSEL 360</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {navGroups.map((group) => {
            const visibleItems = group.items
              .filter(item => !item.adminOnly || canManage)
              .filter(item => !item.agencyOnly || isAgency)
              .filter(item => !isAttendant || ATTENDANT_ALLOWED_HREFS.includes(item.href))
            if (visibleItems.length === 0) return null
            return (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <p className="px-3.5 mb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">{group.label}</p>
              )}
              <div className="space-y-0.5 px-2">
                {visibleItems.map(({ label, href, icon: Icon, service, comingSoon }) => {
                  const active = (pendingHref ?? pathname) === href
                  const willShowComingSoon = comingSoon && !isAgency
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
          {isAgency && (
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

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-5 w-5 h-5 rounded-full border flex items-center justify-center transition-all z-30"
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
