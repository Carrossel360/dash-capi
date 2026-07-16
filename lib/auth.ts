import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-prod')

export interface JWTPayload {
  userId: string
  workspaceId: string
  role: string
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as JWTPayload
}

export async function getAuthPayload(req: NextRequest): Promise<JWTPayload | null> {
  try {
    const header = req.headers.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return null
    const payload = await verifyToken(token)

    // O JWT tem validade de 7 dias e nunca é invalidado no servidor — sem essa checagem, revogar
    // o acesso de alguém (excluir o WorkspaceMember) não tira o acesso de quem já está logado até
    // o token expirar sozinho. Confirma que a membership ainda existe a cada request.
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: payload.workspaceId, userId: payload.userId } },
    })
    if (!membership) return null

    return { ...payload, role: membership.role }
  } catch {
    return null
  }
}
