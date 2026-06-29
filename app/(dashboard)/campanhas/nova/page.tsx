'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import TopBar from '@/components/TopBar'

export default function NovaCampanhaPage() {
  const router = useRouter()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Nova Campanha" />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Editor de fluxo da nova campanha</p>
          <button onClick={() => router.push('/campanhas/1')} className="gradient-brand text-white px-4 py-2 rounded-lg text-sm font-medium">
            Abrir editor demo
          </button>
        </div>
      </main>
    </div>
  )
}
