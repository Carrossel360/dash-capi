import crypto from 'crypto'
import type { Workspace } from '@prisma/client'

// Monta o objeto `services` retornado por login/switch/me — os três precisam do mesmo shape
// pra alimentar WorkspaceServices (lib/store/auth.ts) no Zustand.
export function buildWorkspaceServices(ws: Workspace) {
  return {
    trafeqoPago: ws.svcTrafeqoPago,
    metaAds: ws.svcMetaAds,
    googleAds: ws.svcGoogleAds,
    socialMedia: ws.svcSocialMedia,
    googleBusiness: ws.svcGoogleBusiness,
    googleLocal: ws.svcGoogleLocal,
    contentStudio: ws.svcContentStudio,
  }
}

export function generateEventId(): string {
  return `eid_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

export function hashData(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

export function calculateMatchQuality(userData: Record<string, unknown>): number {
  let score = 0
  if (userData.em) score += 2.5
  if (userData.ph) score += 2.5
  if (userData.client_ip_address) score += 1.5
  if (userData.client_user_agent) score += 1
  if (userData.fbc || userData.fbp) score += 2
  if (userData.fn || userData.ln) score += 1
  return Math.min(score, 10)
}

export function buildHashedUserData(raw: {
  email?: string | null
  phone?: string | null
  ip?: string | null
  userAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  ctwaClid?: string | null
}) {
  return {
    em: raw.email ? [hashData(raw.email)] : undefined,
    ph: raw.phone ? [hashData(raw.phone.replace(/\D/g, ''))] : undefined,
    client_ip_address: raw.ip || undefined,
    client_user_agent: raw.userAgent || undefined,
    fbp: raw.fbp || undefined,
    fbc: raw.fbc || undefined,
    ctwa_clid: raw.ctwaClid || undefined,
  }
}
