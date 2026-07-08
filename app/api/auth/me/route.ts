import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
    services: {
      trafeqoPago: ws.svcTrafeqoPago,
      socialMedia: ws.svcSocialMedia,
      googleBusiness: ws.svcGoogleBusiness,
      googleLocal: ws.svcGoogleLocal,
      contentStudio: ws.svcContentStudio,
    },
    funnelMetrics: ws.funnelMetrics,
    metaVisibleMetrics: ws.metaVisibleMetrics,
    googleVisibleMetrics: ws.googleVisibleMetrics,
  }

  return NextResponse.json({ user, workspace, role: auth.role })
}
