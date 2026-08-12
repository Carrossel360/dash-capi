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
      extraServices: { select: { key: true } },
      _count: { select: { leads: true, capiEvents: true, campaigns: true } },
    },
  })
  if (!workspace) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  // `findUnique` sem `select` devolve todos os campos escalares do Workspace, incluindo
  // credenciais sensíveis (tokens da UazAPI, Meta, chaves de IA) — sem essa checagem,
  // qualquer role (attendant/viewer) que tenha acesso a esse workspace conseguia ler esses
  // segredos direto pela API, mesmo a UI só mostrando esses campos pra admin/manager.
  const responseWorkspace = ['admin', 'manager'].includes(membership.role)
    ? workspace
    : (() => {
        const { metaAccessToken, uazapiUrl, uazapiAdminToken, uazapiToken, openaiApiKey, anthropicApiKey, telegramBotToken, ...safe } = workspace
        return safe
      })()

  return NextResponse.json({
    workspace: { ...responseWorkspace, extraServices: workspace.extraServices.map(s => s.key) },
  })
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
    name, segment, plan, metaPixelId, metaAccessToken, metaAdAccountId, metaPageId, googleAdsCustomerId, localServicesAccountId,
    currency, svcMetaAds, svcGoogleAds, svcSocialMedia, svcGoogleBusiness, svcGoogleLocal, svcContentStudio, svcSiteGenerator,
    metaVisibleMetrics, googleVisibleMetrics, funnelMetrics, googleFunnelMetrics, whatsappNumber, isActive, extraServices,
    isAgencyInternal,
  } = await req.json()
  const normalizedLocalServicesAccountId = localServicesAccountId === undefined
    ? undefined
    : String(localServicesAccountId).replace(/\D/g, '') || null

  // Só um cliente pode representar as operações internas da agência por vez — a Visão Geral
  // da Agência (ver app/api/agency/overview/route.ts) lê Leads/Reuniões/Investimento dele.
  if (isAgencyInternal === true) {
    await prisma.workspace.updateMany({
      where: { isAgency: false, isAgencyInternal: true, id: { not: params.id } },
      data: { isAgencyInternal: false },
    })
  }

  if (extraServices !== undefined) {
    const keys: string[] = Array.isArray(extraServices) ? extraServices : []
    await prisma.$transaction([
      prisma.workspaceService.deleteMany({ where: { workspaceId: params.id, key: { notIn: keys } } }),
      ...keys.map(key => prisma.workspaceService.upsert({
        where: { workspaceId_key: { workspaceId: params.id, key } },
        create: { workspaceId: params.id, key },
        update: {},
      })),
    ])
  }

  const workspace = await prisma.workspace.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(segment !== undefined && { segment }),
      ...(plan && { plan }),
      ...(isActive !== undefined && { isActive }),
      ...(metaPixelId !== undefined && { metaPixelId }),
      ...(metaAccessToken && { metaAccessToken }),
      ...(metaAdAccountId !== undefined && { metaAdAccountId }),
      ...(metaPageId !== undefined && { metaPageId }),
      ...(googleAdsCustomerId !== undefined && { googleAdsCustomerId }),
      ...(normalizedLocalServicesAccountId !== undefined && { localServicesAccountId: normalizedLocalServicesAccountId }),
      ...(whatsappNumber !== undefined && { whatsappNumber }),
      ...(currency && { currency }),
      ...(svcMetaAds !== undefined && { svcMetaAds }),
      ...(svcGoogleAds !== undefined && { svcGoogleAds }),
      ...(svcSocialMedia !== undefined && { svcSocialMedia }),
      ...(svcGoogleBusiness !== undefined && { svcGoogleBusiness }),
      ...(svcGoogleLocal !== undefined && { svcGoogleLocal }),
      ...(svcContentStudio !== undefined && { svcContentStudio }),
      ...(svcSiteGenerator !== undefined && { svcSiteGenerator }),
      ...(metaVisibleMetrics !== undefined && { metaVisibleMetrics }),
      ...(googleVisibleMetrics !== undefined && { googleVisibleMetrics }),
      ...(funnelMetrics !== undefined && { funnelMetrics }),
      ...(googleFunnelMetrics !== undefined && { googleFunnelMetrics }),
      ...(isAgencyInternal !== undefined && { isAgencyInternal }),
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
