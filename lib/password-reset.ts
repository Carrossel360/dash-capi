import { SignJWT, jwtVerify } from 'jose'

// Mesmo padrão de lib/services-checkup.ts — token de propósito único, curta duração (30 min,
// bem menor que os 7 dias do JWT de sessão em lib/auth.ts), assinado com o mesmo secret.
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-prod')
const PURPOSE = 'password-reset'

export async function signPasswordResetToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30m')
    .sign(secret)
}

export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    if (payload.purpose !== PURPOSE || typeof payload.userId !== 'string') return null
    return payload.userId
  } catch {
    return null
  }
}
