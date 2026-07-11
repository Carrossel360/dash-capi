import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildWorkspaceServices } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true },
  })

  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
  if (!ws) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })

  // Mesmo formato de app/api/auth/switch/route.ts — usado pra "refrescar" currentWorkspace
  // no Zustand sem precisar trocar de workspace ou logar de novo (ver lib/store/auth.ts).
  const workspace = {
    id: ws.id, name: ws.name, slug: ws.slug,
    segment: ws.segment, isAgency: ws.isAgency,
    role: auth.role,
    currency: ws.currency,
    services: buildWorkspaceServices(ws),
    funnelMetrics: ws.funnelMetrics,
    googleFunnelMetrics: ws.googleFunnelMetrics,
    metaVisibleMetrics: ws.metaVisibleMetrics,
    googleVisibleMetrics: ws.googleVisibleMetrics,
  }

  return NextResponse.json({ user, workspace, role: auth.role })
}
