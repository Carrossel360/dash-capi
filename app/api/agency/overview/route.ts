import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange } from '@/lib/trafego-period'
import { buildMetaTrafficSnapshot, buildGoogleTrafficSnapshot } from '@/lib/trafego-aggregate'
import { EXTRA_SERVICES } from '@/lib/services-catalog'

const SVC_BOOLEAN_KEYS = ['svcMetaAds', 'svcGoogleAds', 'svcGoogleLocal', 'svcSocialMedia', 'svcGoogleBusiness'] as const

// Bloco "Comercial" da Visão Geral da Agência — lido do cliente marcado como
// `Workspace.isAgencyInternal` (a Carrossel cadastrada como cliente normal pra ter Pipeline e
// Tráfego Pago próprios), não do workspace de login isAgency:true. Ver decisão registrada no
// plano: Reuniões/Clientes usam tags estáveis no PipelineStage (isMeetingStage /
// triggerCapiEvent=purchase+closedAt), não o nome do estágio.
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { isAgency: true } })
  if (!ws?.isAgency || !['admin', 'manager'].includes(auth.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const period = req.nextUrl.searchParams.get('period') ?? 'this_month'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  const internalClient = await prisma.workspace.findFirst({
    where: { isAgency: false, isAgencyInternal: true },
    select: { id: true, currency: true },
  })

  let leads = 0, reunioes = 0, clientesFechados = 0, investimento = 0
  if (internalClient) {
    const range = dateRange(period, from, to)
    const dateFilter = range ? { gte: range.gte, lte: range.lte } : undefined
    const [l, r, c, meta, goog] = await Promise.all([
      prisma.lead.count({ where: { workspaceId: internalClient.id, ...(dateFilter ? { createdAt: dateFilter } : {}) } }),
      prisma.lead.count({ where: { workspaceId: internalClient.id, stage: { isMeetingStage: true } } }),
      prisma.lead.count({ where: { workspaceId: internalClient.id, closedAt: dateFilter ?? { not: null } } }),
      buildMetaTrafficSnapshot(internalClient.id, period, from, to),
      buildGoogleTrafficSnapshot(internalClient.id, period, from, to),
    ])
    leads = l; reunioes = r; clientesFechados = c
    investimento = (meta?.kpis?.spend ?? 0) + (goog?.kpis?.spend ?? 0)
  }

  const [qtdClientesAtivos, svcCounts, extraRows] = await Promise.all([
    prisma.workspace.count({ where: { isAgency: false, isActive: true } }),
    Promise.all(SVC_BOOLEAN_KEYS.map(key =>
      prisma.workspace.count({ where: { isAgency: false, isActive: true, [key]: true } })
    )),
    prisma.workspaceService.findMany({
      where: { workspace: { isAgency: false, isActive: true } },
      select: { key: true },
    }),
  ])

  const extraCountByKey = new Map<string, number>()
  for (const row of extraRows) extraCountByKey.set(row.key, (extraCountByKey.get(row.key) ?? 0) + 1)

  const services = [
    { key: 'svcMetaAds', label: 'Tráfego Meta', count: svcCounts[0] },
    { key: 'svcGoogleAds', label: 'Tráfego Google Ads', count: svcCounts[1] },
    { key: 'svcGoogleLocal', label: 'Tráfego GLS', count: svcCounts[2] },
    { key: 'svcSocialMedia', label: 'Social Media', count: svcCounts[3] },
    { key: 'svcGoogleBusiness', label: 'Google Business', count: svcCounts[4] },
    ...EXTRA_SERVICES.map(s => ({ key: s.key, label: s.label, count: extraCountByKey.get(s.key) ?? 0 })),
  ]

  return NextResponse.json({
    leads, reunioes, clientesFechados, qtdClientesAtivos, investimento,
    internalClientConfigured: !!internalClient,
    currency: internalClient?.currency ?? 'BRL',
    services,
  })
}
