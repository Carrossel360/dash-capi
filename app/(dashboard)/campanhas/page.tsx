'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone, MessageSquare, Mail, Phone, Layers, Plus, Play, Pause, Copy, Trash2, ArrowRight, Users, Send, X, ChevronRight, Zap, Clock } from 'lucide-react'
import TopBar from '@/components/TopBar'

const campanhas = [
  { id: '1', nome: 'Nutrição de leads — Boas-vindas', canal: 'whatsapp', tipo: 'Automação', status: 'ativo', blocos: 8, ultimoDisparo: '2 min', contatos: 1284, enviados: 3842, openRate: '68%', convRate: '11.1%' },
  { id: '2', nome: 'Follow-up — Proposta enviada', canal: 'multi', tipo: 'Sequência', status: 'ativo', blocos: 12, ultimoDisparo: '15 min', contatos: 347, enviados: 1041, openRate: '74%', convRate: '18.4%' },
  { id: '3', nome: 'Promoção de verão — Email', canal: 'email', tipo: 'Disparo avulso', status: 'agendado', blocos: 3, ultimoDisparo: 'Agendado: 25/06 09h', contatos: 2840, enviados: 0, openRate: '—', convRate: '—' },
  { id: '4', nome: 'Recuperação de leads frios', canal: 'sms', tipo: 'Disparo avulso', status: 'pausado', blocos: 5, ultimoDisparo: '3 dias', contatos: 512, enviados: 512, openRate: '42%', convRate: '6.2%' },
  { id: '5', nome: 'Reengajamento — 30 dias sem resposta', canal: 'whatsapp', tipo: 'Automação', status: 'rascunho', blocos: 6, ultimoDisparo: '—', contatos: 0, enviados: 0, openRate: '—', convRate: '—' },
]

const stats = [
  { label: 'Campanhas ativas', value: '3', icon: Megaphone, color: '#8b5cf6' },
  { label: 'Contatos alcançados', value: '4.983', icon: Users, color: '#10b981' },
  { label: 'Mensagens enviadas', value: '5.395', icon: Send, color: '#2575fc' },
]

const canalIcon: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  whatsapp: MessageSquare, email: Mail, sms: Phone, multi: Layers,
}
const canalColor: Record<string, string> = {
  whatsapp: '#25d366', email: '#8b5cf6', sms: '#2575fc', multi: '#f59e0b',
}
const statusConfig: Record<string, { label: string; color: string }> = {
  ativo: { label: 'Ativo', color: 'text-emerald-400 bg-emerald-400/10' },
  agendado: { label: 'Agendado', color: 'text-blue-400 bg-blue-400/10' },
  pausado: { label: 'Pausado', color: 'text-amber-400 bg-amber-400/10' },
  rascunho: { label: 'Rascunho', color: 'text-slate-400 bg-slate-400/10' },
}

const tiposCampanha = [
  { id: 'automacao', label: 'Automação', desc: 'Fluxo disparado por gatilho automático (novo lead, tag, evento)', icon: Zap, color: '#F5A314' },
  { id: 'disparo', label: 'Disparo avulso', desc: 'Envio único para uma lista de contatos em data/hora específica', icon: Users, color: '#8b5cf6' },
  { id: 'sequencia', label: 'Sequência', desc: 'Série de mensagens espaçadas no tempo (drip campaign)', icon: Clock, color: '#2575fc' },
]

const canaisEnvio = [
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: '#25d366', bg: 'rgba(37,211,102,0.1)', border: 'rgba(37,211,102,0.3)' },
  { id: 'sms', label: 'SMS', icon: Phone, color: '#2575fc', bg: 'rgba(37,117,252,0.1)', border: 'rgba(37,117,252,0.3)' },
  { id: 'email', label: 'Email', icon: Mail, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)' },
  { id: 'multi', label: 'Multi-canal', icon: Layers, color: '#F5A314', bg: 'rgba(245,163,20,0.1)', border: 'rgba(245,163,20,0.3)' },
]

const filters = ['Todas', 'Ativas', 'Agendadas', 'Pausadas', 'Rascunhos']

function NovaCampanhaModal({ onClose, onCreate }: { onClose: () => void; onCreate: (tipo: string, canal: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedTipo, setSelectedTipo] = useState('')

  function handleTipo(id: string) {
    setSelectedTipo(id)
    setStep(2)
  }

  function handleCanal(canal: string) {
    onCreate(selectedTipo, canal)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass rounded-2xl p-6 w-full max-w-md shadow-2xl border border-[#2d2550] z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-white">Nova campanha</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 1 ? 'Escolha o tipo de campanha' : 'Escolha o canal de envio'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1 — Tipo */}
        {step === 1 && (
          <div className="space-y-2">
            {tiposCampanha.map(({ id, label, desc, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => handleTipo(id)}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#0f0b1e] border border-[#1e1635] hover:border-[#6a11cb]/50 hover:bg-[#6a11cb]/5 transition-all group text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — Canal */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors mb-4">
              <ChevronRight className="w-3 h-3 rotate-180" />
              Voltar
            </button>
            <div className="grid grid-cols-2 gap-3">
              {canaisEnvio.map(({ id, label, icon: Icon, color, bg, border }) => (
                <button
                  key={id}
                  onClick={() => handleCanal(id)}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border transition-all hover:scale-105 hover:shadow-lg"
                  style={{ background: bg, borderColor: border }}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <span className="text-sm font-semibold text-white">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CampanhasPage() {
  const [filter, setFilter] = useState('Todas')
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  function handleCreate(tipo: string, canal: string) {
    setShowModal(false)
    router.push('/campanhas/nova')
  }

  const filtered = campanhas.filter(c => {
    if (filter === 'Todas') return true
    if (filter === 'Ativas') return c.status === 'ativo'
    if (filter === 'Agendadas') return c.status === 'agendado'
    if (filter === 'Pausadas') return c.status === 'pausado'
    if (filter === 'Rascunhos') return c.status === 'rascunho'
    return true
  })

  return (
    <>
      {showModal && <NovaCampanhaModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Campanhas" />
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          <div className="grid grid-cols-3 gap-3">
            {stats.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {filters.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${filter === f ? 'gradient-brand text-white' : 'bg-[#1e1635] text-slate-400 hover:text-white'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg gradient-brand text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Campanha
            </button>
          </div>

          <div className="space-y-3">
            {filtered.map((c) => {
              const CanalIcon = canalIcon[c.canal]
              const color = canalColor[c.canal]
              const { label: statusLabel, color: statusCls } = statusConfig[c.status]
              return (
                <div key={c.id} className="glass card-hover rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                        <CanalIcon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{c.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-500">{c.tipo}</span>
                          <span className="text-[10px] text-slate-600">·</span>
                          <span className="text-[10px] text-slate-500">{c.blocos} blocos</span>
                          <span className="text-[10px] text-slate-600">·</span>
                          <span className="text-[10px] text-slate-500">{c.ultimoDisparo}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                      <div className="flex items-center gap-1">
                        <button className="w-7 h-7 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                          {c.status === 'ativo' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                        <button className="w-7 h-7 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button className="w-7 h-7 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {[
                      { label: 'Contatos', value: c.contatos.toLocaleString('pt-BR') },
                      { label: 'Enviados', value: c.enviados.toLocaleString('pt-BR') },
                      { label: 'Taxa abertura', value: c.openRate },
                      { label: 'Conversão', value: c.convRate },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[#0f0b1e] rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-white">{value}</p>
                        <p className="text-[10px] text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => router.push(`/campanhas/${c.id}`)}
                    className="flex items-center gap-1 text-xs text-[#8b5cf6] hover:text-white transition-colors font-medium"
                  >
                    <span>Editar fluxo</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>

        </main>
      </div>
    </>
  )
}
