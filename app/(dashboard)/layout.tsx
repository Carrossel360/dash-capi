'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import Sidebar from '@/components/Sidebar'
import { useAuthStore } from '@/lib/store/auth'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hydrated, token, updateCurrentWorkspace, switchWorkspace } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (_hydrated && !isAuthenticated) router.push('/login')
  }, [isAuthenticated, _hydrated, router])

  // Refresca currentWorkspace do banco ao carregar o app — sem isso, mudanças feitas pelo
  // admin (métricas visíveis, serviços contratados, etc.) só chegam no cliente se ele
  // deslogar/logar de novo ou trocar de workspace explicitamente. Se o papel (role) desse
  // membro mudou nesse meio tempo, /api/auth/me também devolve um token novo já assinado com
  // o papel atual — sem isso, o JWT antigo manteria o papel velho por até 7 dias (o valor do
  // role fica embutido no próprio token, não é relido do banco a cada request).
  useEffect(() => {
    if (!_hydrated || !isAuthenticated || !token) return
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.workspace) return
        if (d.token) switchWorkspace(d.token, d.workspace)
        else updateCurrentWorkspace(d.workspace)
      })
      .catch(() => {})
  }, [_hydrated, isAuthenticated, token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!_hydrated) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#6a11cb] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0f0b1e',
            color: '#e2e8f0',
            border: '1px solid #2d2550',
            borderRadius: '10px',
            fontSize: '13px',
          },
        }}
      />
    </div>
  )
}
