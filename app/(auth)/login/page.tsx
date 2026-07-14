'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/store/auth'
import { defaultRouteForRole } from '@/lib/roleAccess'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const router = useRouter()

  async function doLogin(e: string, p: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Credenciais inválidas')
    login(data.user, data.token, data.workspace ?? { id: data.workspaceId, name: '', slug: '' })
    router.push(defaultRouteForRole(data.workspace))
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault(); setError(''); setLoading(true)
    try { await doLogin(email, password) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao entrar') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#06040f' }}>

      {/* Background animado */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Orb 1 — roxo grande central, flutua devagar */}
        <div className="orb-1" style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 800, height: 800, borderRadius: '50%',
          background: 'radial-gradient(circle, #7c22e8 0%, #4a0082 45%, transparent 70%)',
          filter: 'blur(90px)',
          opacity: 0.45,
        }} />
        {/* Orb 2 — laranja canto inferior direito */}
        <div className="orb-2" style={{
          position: 'absolute', bottom: -80, right: '5%',
          width: 560, height: 560, borderRadius: '50%',
          background: 'radial-gradient(circle, #F5A314 0%, #d4770a 60%, transparent 80%)',
          filter: 'blur(100px)',
          opacity: 0.3,
        }} />
        {/* Orb 3 — roxo/azul canto superior esquerdo */}
        <div className="orb-3" style={{
          position: 'absolute', top: -60, left: -60,
          width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, #2575fc 0%, #6a11cb 55%, transparent 75%)',
          filter: 'blur(80px)',
          opacity: 0.35,
        }} />
        {/* Orb 4 — azul elétrico pulsando no centro-inferior */}
        <div className="orb-4" style={{
          position: 'absolute', bottom: '20%', left: '30%',
          width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, #2575fc 0%, #6a11cb 70%, transparent 90%)',
          filter: 'blur(70px)',
          opacity: 0.25,
        }} />
      </div>

      <div className="w-full max-w-[360px] relative z-10">
        {/* Logo — ocupa bem o espaço */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-28 h-28 rounded-full overflow-hidden mb-4 flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(245,163,20,0.35), 0 0 80px rgba(106,17,203,0.2)' }}
          >
            <Image src="/logo-c360.png" alt="Carrossel 360" width={112} height={112}
              className="w-full h-full object-cover" priority />
          </div>
          <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">Central do Cliente</p>
          <h1 className="text-2xl font-black tracking-wider mt-1" style={{ color: '#F5A314' }}>
            CARROSSEL 360
          </h1>
          <p className="text-xs text-slate-500 mt-2">Faça login na sua conta</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 shadow-2xl border"
          style={{
            background: 'rgba(13,10,31,0.90)',
            borderColor: 'rgba(106,17,203,0.25)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 60px rgba(106,17,203,0.15), 0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" required
                className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none transition-all"
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#F5A314'}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#2d2550'}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Senha</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full px-3 py-2.5 pr-10 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none transition-all"
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#F5A314'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#2d2550'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
            )}

            {/* Botão Entrar — laranja sólido Carrossel */}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
              style={{
                background: '#F5A314',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(245,163,20,0.4)',
                color: '#06040f',
              }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
