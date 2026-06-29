'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import Sidebar from '@/components/Sidebar'
import { useAuthStore } from '@/lib/store/auth'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hydrated } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (_hydrated && !isAuthenticated) router.push('/login')
  }, [isAuthenticated, _hydrated, router])

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
