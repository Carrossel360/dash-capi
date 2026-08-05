'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (password.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres'); return }
    if (password !== confirmPassword) { setError('As senhas não coincidem'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha')
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#06040f' }}>
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center mb-7">
          <div className="w-20 h-20 rounded-full overflow-hidden mb-4 flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(245,163,20,0.35), 0 0 80px rgba(106,17,203,0.2)' }}>
            <Image src="/logo-c360.png" alt="Carrossel 360" width={80} height={80} className="w-full h-full object-cover" priority />
          </div>
          <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">Sistema Orbital</p>
          <h1 className="text-lg font-black tracking-wider mt-1" style={{ color: '#F5A314' }}>CARROSSEL 360</h1>
        </div>

        <div className="rounded-2xl p-6 shadow-2xl border"
          style={{ background: 'rgba(13,10,31,0.90)', borderColor: 'rgba(106,17,203,0.25)', backdropFilter: 'blur(16px)' }}>

          {done ? (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-white font-medium">Senha redefinida!</p>
              <p className="text-xs text-slate-400">Redirecionando pro login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Redefinir senha</h2>
                <p className="text-xs text-slate-500">Escolha uma nova senha pra sua conta.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Nova senha</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="w-full px-3 py-2.5 pr-10 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none transition-all"
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#F5A314'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#2d2550'}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Confirmar senha</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full px-3 py-2.5 text-sm bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none transition-all"
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#F5A314'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#2d2550'}
                />
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#F5A314', color: '#06040f' }}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>

              <Link href="/login" className="flex items-center justify-center text-xs text-slate-500 hover:text-white transition-colors">
                Voltar pro login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
