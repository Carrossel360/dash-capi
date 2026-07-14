'use client'
import { Clock, X } from 'lucide-react'

// Modal "ainda não disponível" — diferente do LockedServiceModal (que é upsell comercial
// de "serviço não contratado"): aqui a feature simplesmente ainda não existe/não está pronta
// pro cliente, independente de plano contratado. Usado pelo Sidebar em itens marcados
// `comingSoon` (Campanhas, Google Local, Content Studio) quando o workspace não é a agência.
export default function ComingSoonModal({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-sm shadow-2xl z-10 text-center"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
      >
        <button onClick={onClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'rgba(106,17,203,0.15)', border: '1px solid rgba(106,17,203,0.3)' }}>
          <Clock className="w-6 h-6" style={{ color: '#6a11cb' }} />
        </div>
        <h3 className="text-base font-bold text-white mb-1">Em breve</h3>
        <p className="text-sm text-slate-400 mb-5">
          <span className="text-[#F5A314] font-semibold">{label}</span> ainda está em construção e não está disponível por aqui ainda.
        </p>
        <button onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
          Entendi
        </button>
      </div>
    </div>
  )
}
