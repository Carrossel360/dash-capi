import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, signToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId } = await req.json()

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: auth.userId } },
    include: { workspace: true },
  })

  if (!membership) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const token = await signToken({
    userId: auth.userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
  })

  const ws = membership.workspace
  return NextResponse.json({
    token,
    workspace: {
      id: ws.id, name: ws.name, slug: ws.slug,
      segment: ws.segment, isAgency: ws.isAgency,
      role: membership.role,
      currency: ws.currency,
      services: {
        trafeqoPago: ws.svcTrafeqoPago,
        socialMedia: ws.svcSocialMedia,
        googleBusiness: ws.svcGoogleBusiness,
        googleLocal: ws.svcGoogleLocal,
      },
      funnelMetrics: ws.funnelMetrics,
      metaVisibleMetrics: ws.metaVisibleMetrics,
      googleVisibleMetrics: ws.googleVisibleMetrics,
    },
  })
}
