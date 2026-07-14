import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, signToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildWorkspaceServices } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [user, ws, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true, name: true, email: true } }),
    prisma.workspace.findUnique({ where: { id: auth.workspaceId } }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: auth.userId } },
      select: { role: true },
    }),
  ])
  if (!ws) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })

  // O role vem embutido no JWT (assinado no login/switch) — se um admin mudou o papel desse
  // membro depois que o token foi emitido, `auth.role` fica desatualizado até o usuário deslogar.
  // Aqui relemos o role atual do banco e, se divergir, reemitimos um token novo — assim a troca
  // de papel passa a valer na próxima vez que o dashboard chamar essa rota (no mount do layout),
  // sem precisar de logout/login.
  const currentRole = membership?.role ?? auth.role
  const token = currentRole !== auth.role
    ? await signToken({ userId: auth.userId, workspaceId: auth.workspaceId, role: currentRole })
    : undefined

  // Mesmo formato de app/api/auth/switch/route.ts — usado pra "refrescar" currentWorkspace
  // no Zustand sem precisar trocar de workspace ou logar de novo (ver lib/store/auth.ts).
  const workspace = {
    id: ws.id, name: ws.name, slug: ws.slug,
    segment: ws.segment, isAgency: ws.isAgency,
    role: currentRole,
    currency: ws.currency,
    services: buildWorkspaceServices(ws),
    funnelMetrics: ws.funnelMetrics,
    googleFunnelMetrics: ws.googleFunnelMetrics,
    metaVisibleMetrics: ws.metaVisibleMetrics,
    googleVisibleMetrics: ws.googleVisibleMetrics,
  }

  return NextResponse.json({ user, workspace, role: currentRole, ...(token ? { token } : {}) })
}
