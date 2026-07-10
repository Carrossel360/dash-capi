'use client'
import { Megaphone } from 'lucide-react'
import TopBar from '@/components/TopBar'

export default function CampanhasPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Campanhas" />
      <main className="flex-1 flex items-center justify-center p-5">
        <div className="glass rounded-2xl p-8 max-w-sm text-center">
          <div className="w-14 h-14 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center mx-auto mb-4">
            <Megaphone className="w-7 h-7 text-[#8b5cf6]" />
          </div>
          <h2 className="text-sm font-bold text-white mb-2">Em Breve</h2>
          <p className="text-xs text-slate-500">
            Automação de campanhas (WhatsApp, e-mail, SMS) está em construção. Essa página fica disponível assim que a configuração de disparos estiver pronta.
          </p>
        </div>
      </main>
    </div>
  )
}
