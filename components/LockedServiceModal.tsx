'use client'
import { Lock, X, Phone } from 'lucide-react'

// Modal "serviço não contratado" — usado pelo Sidebar (rota inteira bloqueada) e por
// telas que bloqueiam uma sub-aba interna (ex: trafego-pago/page.tsx, Meta vs Google Ads).
export default function LockedServiceModal({ label, onClose }: { label: string; onClose: () => void }) {
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
          <Lock className="w-6 h-6" style={{ color: '#6a11cb' }} />
        </div>
        <h3 className="text-base font-bold text-white mb-1">Serviço não contratado</h3>
        <p className="text-sm text-slate-400 mb-1">
          <span className="text-[#F5A314] font-semibold">{label}</span> não está incluído no seu plano atual.
        </p>
        <p className="text-xs text-slate-500 mb-5">Entre em contato com nossa equipe para contratar este serviço e ter acesso a todas as métricas e relatórios.</p>
        <a href={`https://wa.me/5511999999999?text=Ol%C3%A1!+Gostaria+de+contratar+o+servi%C3%A7o+de+${encodeURIComponent(label)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: '#25d366', boxShadow: '0 4px 16px rgba(37,211,102,0.3)' }}
        >
          <Phone className="w-4 h-4" />
          Falar com a equipe
        </a>
        <button onClick={onClose}
          className="mt-2 w-full py-2 rounded-xl text-xs text-slate-500 hover:text-white transition-colors border border-[#2d2550]">
          Fechar
        </button>
      </div>
    </div>
  )
}
