'use client'
import { useState, useEffect } from 'react'
import { Loader2, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'
import TopBar from '@/components/TopBar'
import { useAuthStore } from '@/lib/store/auth'

// Versão enxuta da seção de QR Code que já existe em Configurações (settings/page.tsx) —
// aquela tela é 100% bloqueada pra workspaces de cliente (redireciona pra /dashboard), então
// o cliente nunca conseguia reconectar o próprio WhatsApp. Esta página reaproveita o mesmo
// endpoint (GET /api/workspace/whatsapp, já sem restrição de role) mas mostra só status +
// botão de reconectar/QR — nada dos campos administrativos (URL/tokens da UazAPI).
export default function WhatsAppPage() {
  const { token } = useAuthStore()
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown')
  const [notConfigured, setNotConfigured] = useState(false)

  async function fetchQrCode() {
    setLoadingQr(true)
    setQrCode(null)
    setNotConfigured(false)
    try {
      const res = await fetch('/api/workspace/whatsapp', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.error) {
        if (String(data.error).includes('não configurado')) {
          setNotConfigured(true)
        } else {
          toast.error(data.error)
        }
        setWaStatus('disconnected')
        return
      }
      const qr = data.qrcode ?? data.qr ?? data.base64 ?? data.QRCode ?? data.code ?? data.pairingCode ?? null
      if (data.status === 'connected' || data.state === 'open' || data.connectionStatus === 'CONNECTED') {
        setWaStatus('connected')
        setQrCode(null)
      } else if (qr) {
        setQrCode(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
        setWaStatus('disconnected')
      } else {
        toast.error('Não foi possível obter o QR Code. Tente novamente em alguns segundos.')
        setWaStatus('disconnected')
      }
    } catch {
      toast.error('Não foi possível conectar ao WhatsApp')
    } finally {
      setLoadingQr(false)
    }
  }

  useEffect(() => { if (token) fetchQrCode() }, [token]) // eslint-disable-line

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="WhatsApp" />
      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-md">
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-green-400" />
                Conectar WhatsApp
              </h2>
              <button onClick={fetchQrCode} disabled={loadingQr || notConfigured}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 disabled:opacity-40 transition-all">
                {loadingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {loadingQr ? 'Verificando...' : waStatus === 'connected' ? 'Reconectar' : 'Gerar QR Code'}
              </button>
            </div>

            {notConfigured && (
              <p className="text-xs text-slate-500">
                O WhatsApp deste cliente ainda não foi configurado pela equipe da Carrossel 360.
              </p>
            )}

            {!notConfigured && waStatus === 'connected' && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-lg">
                <Wifi className="w-3.5 h-3.5" /> WhatsApp conectado
              </div>
            )}
            {!notConfigured && waStatus === 'disconnected' && !qrCode && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg">
                <WifiOff className="w-3.5 h-3.5" /> Desconectado — clique em &quot;Gerar QR Code&quot; para reconectar
              </div>
            )}

            {qrCode && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-52 h-52" />
                <p className="text-xs text-slate-800 text-center">
                  Abra o WhatsApp → Menu → Dispositivos vinculados → Vincular dispositivo
                </p>
              </div>
            )}

            {!notConfigured && !qrCode && waStatus === 'unknown' && (
              <p className="text-xs text-slate-500">Verificando status da conexão...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
