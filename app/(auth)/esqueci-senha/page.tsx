'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
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

          {sent ? (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ background: 'rgba(106,17,203,0.15)' }}>
                <Mail className="w-5 h-5" style={{ color: '#8b5cf6' }} />
              </div>
              <p className="text-sm text-white font-medium">Verifique seu e-mail</p>
              <p className="text-xs text-slate-400">Se {email} estiver cadastrado, você vai receber um link pra redefinir a senha em instantes.</p>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-xs mt-2 hover:opacity-80 transition-opacity" style={{ color: '#F5A314' }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar pro login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Esqueceu sua senha?</h2>
                <p className="text-xs text-slate-500">Digite seu e-mail e enviaremos um link pra você redefinir a senha.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com" required
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
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>

              <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar pro login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
