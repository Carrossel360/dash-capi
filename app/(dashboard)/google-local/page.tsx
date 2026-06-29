'use client'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Star, DollarSign, Users, CheckCircle, Shield, AlertTriangle } from 'lucide-react'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

const kpis = [
  { label: 'Leads (7 dias)', value: '44', trend: '+18%', sub: 'verificados pelo Google', color: '#f59e0b', icon: Users },
  { label: 'Custo Total', value: 'R$ 1.320', trend: 'R$ 30 por lead', sub: 'esta semana', color: '#8b5cf6', icon: DollarSign },
  { label: 'Convertidos', value: '25', trend: '57% de conversão', sub: 'de 44 leads', color: '#10b981', icon: CheckCircle },
  { label: 'Score do Perfil', value: '94/100', trend: 'Excelente', sub: 'verificação completa', color: '#2575fc', icon: Star },
]

const leadsData = [
  { dia: 'Seg', leads: 5, convertidos: 3 },
  { dia: 'Ter', leads: 7, convertidos: 4 },
  { dia: 'Qua', leads: 6, convertidos: 3 },
  { dia: 'Qui', leads: 9, convertidos: 5 },
  { dia: 'Sex', leads: 10, convertidos: 6 },
  { dia: 'Sáb', leads: 4, convertidos: 2 },
  { dia: 'Dom', leads: 3, convertidos: 2 },
]

const monthlyData = [
  { mes: 'Jan', leads: 28, convertidos: 15 },
  { mes: 'Fev', leads: 32, convertidos: 18 },
  { mes: 'Mar', leads: 38, convertidos: 21 },
  { mes: 'Abr', leads: 35, convertidos: 20 },
  { mes: 'Mai', leads: 41, convertidos: 23 },
  { mes: 'Jun', leads: 44, convertidos: 25 },
]

const recentLeads = [
  { name: 'Ana Beatriz Silva', servico: 'Limpeza de pele', status: 'Convertido', custo: 'R$ 30', stars: 5, time: '15 min' },
  { name: 'Marcos Lima', servico: 'Botox preventivo', status: 'Em contato', custo: 'R$ 30', stars: null, time: '42 min' },
  { name: 'Sofia Carvalho', servico: 'Preenchimento labial', status: 'Convertido', custo: 'R$ 30', stars: 5, time: '1h' },
  { name: 'Diego Santos', servico: 'Laser hair removal', status: 'Perdido', custo: 'R$ 30', stars: null, time: '2h' },
  { name: 'Letícia Ferreira', servico: 'Dermapen', status: 'Convertido', custo: 'R$ 30', stars: 5, time: '3h' },
  { name: 'Rafael Moura', servico: 'Hidratação facial', status: 'Convertido', custo: 'R$ 30', stars: 4, time: '5h' },
]

const profileHealth = [
  { label: 'Verificação de identidade', ok: true },
  { label: 'Seguro em dia', ok: true },
  { label: 'Licença profissional', ok: true },
  { label: 'Background check', ok: true },
]

const statusColor: Record<string, string> = {
  Convertido: 'text-emerald-400 bg-emerald-400/10',
  'Em contato': 'text-blue-400 bg-blue-400/10',
  Perdido: 'text-red-400 bg-red-400/10',
}

const Tt = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-slate-400">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-semibold text-white">{p.value}</span></p>)}
    </div>
  )
}

export default function GoogleLocalPage() {
  const { currentWorkspace } = useAuthStore()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Google Local Service Ads" />
      <main className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* No integration notice */}
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-3 border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">{currentWorkspace?.name ?? 'Este cliente'}</span> não possui integração com Google Local Service Ads. Os dados abaixo são ilustrativos.
          </p>
        </div>

        {/* Badge */}
        <div className="glass rounded-xl p-4 flex items-center gap-3 border-[#4285f4]/20">
          <div className="w-10 h-10 rounded-xl bg-[#4285f4]/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#4285f4]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              Google Garantido <span className="text-[#4285f4]">✓</span>
            </p>
            <p className="text-xs text-slate-500">Leads verificados pelo Google • Pagamento por lead</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(({ label, value, trend, sub, color, icon: Icon }) => (
            <div key={label} className="glass card-hover rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: `${color}15` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              <p className="text-xs mt-1 font-medium" style={{ color }}>{trend}</p>
              <p className="text-[10px] text-slate-600">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Leads por dia — 7 dias</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={leadsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tt />} />
                <Bar dataKey="leads" name="Leads" fill="#f59e0b" radius={[4,4,0,0]} fillOpacity={0.8} />
                <Bar dataKey="convertidos" name="Convertidos" fill="#10b981" radius={[4,4,0,0]} fillOpacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Evolução mensal</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1635" />
                <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tt />} />
                <Line type="monotone" dataKey="leads" name="Leads" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
                <Line type="monotone" dataKey="convertidos" name="Convertidos" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent leads */}
          <div className="glass rounded-xl overflow-hidden lg:col-span-2">
            <div className="px-4 py-3 border-b border-[#1e1635]">
              <h3 className="text-sm font-semibold text-white">Leads recentes</h3>
            </div>
            <div className="divide-y divide-[#1e1635]/60">
              {recentLeads.map((l, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1e1635] flex items-center justify-center text-xs font-bold text-[#8b5cf6] flex-shrink-0">{l.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{l.name}</p>
                    <p className="text-[10px] text-slate-500">{l.servico}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColor[l.status]}`}>{l.status}</span>
                    {l.stars && (
                      <div className="flex items-center justify-end gap-0.5 mt-1">
                        {Array.from({length: l.stars}).map((_,j) => <Star key={j} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />)}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-300">{l.custo}</p>
                    <p className="text-[10px] text-slate-600">{l.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Profile health */}
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Saúde do Perfil</h3>
            <div className="space-y-3">
              {profileHealth.map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-400/10' : 'bg-red-400/10'}`}>
                    <CheckCircle className={`w-3.5 h-3.5 ${ok ? 'text-emerald-400' : 'text-red-400'}`} />
                  </div>
                  <span className="text-xs text-slate-300">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-[#1e1635]">
              <p className="text-[10px] text-slate-500 mb-2">Score geral</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-[#1e1635] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: '94%' }} />
                </div>
                <span className="text-xs font-bold text-emerald-400">94%</span>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
