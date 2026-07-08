import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      stages: { orderBy: { order: 'asc' } },
      _count: { select: { leads: true, capiEvents: true, campaigns: true } },
    },
  })

  return NextResponse.json({ workspace })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const {
    name, segment, plan, metaPixelId, metaAccessToken, metaAdAccountId, googleAdsCustomerId,
    currency, svcTrafeqoPago, svcSocialMedia, svcGoogleBusiness, svcGoogleLocal, svcContentStudio,
    metaVisibleMetrics, googleVisibleMetrics, funnelMetrics,
  } = await req.json()

  const workspace = await prisma.workspace.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(segment !== undefined && { segment }),
      ...(plan && { plan }),
      ...(metaPixelId !== undefined && { metaPixelId }),
      ...(metaAccessToken && { metaAccessToken }),
      ...(metaAdAccountId !== undefined && { metaAdAccountId }),
      ...(googleAdsCustomerId !== undefined && { googleAdsCustomerId }),
      ...(currency && { currency }),
      ...(svcTrafeqoPago !== undefined && { svcTrafeqoPago }),
      ...(svcSocialMedia !== undefined && { svcSocialMedia }),
      ...(svcGoogleBusiness !== undefined && { svcGoogleBusiness }),
      ...(svcGoogleLocal !== undefined && { svcGoogleLocal }),
      ...(svcContentStudio !== undefined && { svcContentStudio }),
      ...(metaVisibleMetrics !== undefined && { metaVisibleMetrics }),
      ...(googleVisibleMetrics !== undefined && { googleVisibleMetrics }),
      ...(funnelMetrics !== undefined && { funnelMetrics }),
    },
  })

  return NextResponse.json({ workspace })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const ws = await prisma.workspace.findUnique({ where: { id: params.id } })
  if (ws?.isAgency) return NextResponse.json({ error: 'Não é possível excluir a agência' }, { status: 400 })

  try {
    // All child models have onDelete: Cascade — deleting workspace cascades everything
    await prisma.workspace.delete({ where: { id: params.id } })
  } catch (err) {
    console.error('[DELETE /api/clients/:id]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao excluir' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
