// Extraído do GET de app/api/workspace/whatsapp/route.ts — reutilizado também pelo
// cron de monitoramento (lib/monitor.ts) pra checar se a instância caiu.
export type UazapiConnectionState =
  | { kind: 'connected'; state?: string; instance?: unknown }
  | { kind: 'qr'; data: unknown }
  | { kind: 'error'; message: string }

export async function fetchUazapiConnectionState(
  uazapiUrl: string,
  instanceToken: string,
  adminToken: string
): Promise<UazapiConnectionState> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    token: instanceToken,
    AdminToken: adminToken,
  }

  // Primeiro tenta o jeito barato de checar (connectionState) — só cai pro connect
  // (que gera QR code) se não conseguir confirmar conexão por aqui.
  const statusRes = await fetch(`${uazapiUrl}/instance/connectionState`, { headers }).catch(() => null)
  if (statusRes?.ok) {
    const statusData = await statusRes.json()
    const state = statusData?.state ?? statusData?.status ?? statusData?.connectionStatus ?? ''
    if (state === 'open' || state === 'connected') {
      return { kind: 'connected', state }
    }
  }

  const qrRes = await fetch(`${uazapiUrl}/instance/connect`, { method: 'POST', headers })
  const data = await qrRes.json()

  if (!qrRes.ok) {
    return { kind: 'error', message: `UazAPI: ${data?.error ?? data?.message ?? qrRes.status}` }
  }
  if (data.connected || data.loggedIn || data.instance?.status === 'connected') {
    return { kind: 'connected', instance: data.instance }
  }
  return { kind: 'qr', data }
}
