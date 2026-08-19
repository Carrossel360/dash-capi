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

// Verdadeiro se o usuário é admin/manager em QUALQUER workspace com isAgency:true —
// independe de qual workspace está selecionado no momento (auth.workspaceId), diferente de
// checar `isAgency` do workspace atual. Usado onde a permissão deve seguir a pessoa, não a
// navegação (ex: ver notificações de todos os clientes mesmo enquanto está olhando um só).
export async function isAgencyStaff(userId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, role: { in: ['admin', 'manager'] }, workspace: { isAgency: true } },
  })
  return !!membership
}

// Retorna a lista de TaskSpace que o usuário pode ver, ou null se não há restrição
// (admin/manager veem tudo, e workspaces de cliente não usam esse escopo). Implementa a
// "Seleção de Espaço" do nível de acesso Equipe, via TaskSpaceMember.
export async function getAccessibleTaskSpaceIds(auth: JWTPayload): Promise<string[] | null> {
  if (auth.role !== 'viewer') return null
  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { isAgency: true } })
  if (!ws?.isAgency) return null
  const memberships = await prisma.taskSpaceMember.findMany({
    where: { userId: auth.userId, taskSpace: { workspaceId: auth.workspaceId } },
    select: { taskSpaceId: true },
  })
  return memberships.map(m => m.taskSpaceId)
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
