'use client'
import { Shield } from 'lucide-react'
import TopBar from '@/components/TopBar'

export default function GoogleLocalPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Google Local Service Ads" />
      <main className="flex-1 flex items-center justify-center p-5">
        <div className="glass rounded-2xl p-8 max-w-sm text-center">
          <div className="w-14 h-14 rounded-xl bg-[#4285f4]/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-[#4285f4]" />
          </div>
          <h2 className="text-sm font-bold text-white mb-2">Em Breve</h2>
          <p className="text-xs text-slate-500">
            Estamos construindo a integração real com o Google Local Services Ads. Essa página fica disponível assim que estiver pronta.
          </p>
        </div>
      </main>
    </div>
  )
}
