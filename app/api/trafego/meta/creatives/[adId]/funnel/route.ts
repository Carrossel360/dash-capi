import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange } from '@/lib/trafego-period'

export async function GET(req: NextRequest, { params }: { params: { adId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = req.nextUrl.searchParams.get('period') ?? '30d'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  // A rota de lista usa 30 dias como fallback para "Todo período", pois a API de Insights
  // da Meta exige uma janela concreta. Mantém o detalhe com a mesma coorte da lista.
  const range = dateRange(period === 'all' ? '30d' : period, from, to)

  const [stages, leads] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { workspaceId: auth.workspaceId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, color: true, order: true, isMeetingStage: true, triggerCapiEvent: true },
    }),
    prisma.lead.findMany({
      where: {
        workspaceId: auth.workspaceId,
        metaAdId: params.adId,
        ...(range ? { createdAt: range } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        source: true,
        clientType: true,
        dealValue: true,
        closedAt: true,
        createdAt: true,
        pipelineStageId: true,
        stage: { select: { id: true, name: true, color: true, isMeetingStage: true, triggerCapiEvent: true } },
        deals: { select: { value: true } },
      },
    }),
  ])

  const countByStage = new Map<string, number>()
  let meetings = 0
  let sales = 0
  let revenue = 0

  const leadRows = leads.map(lead => {
    countByStage.set(lead.pipelineStageId, (countByStage.get(lead.pipelineStageId) ?? 0) + 1)
    const isSale = Boolean(lead.closedAt) || lead.stage.triggerCapiEvent === 'purchase'
    const dealsValue = lead.deals.reduce((total, deal) => total + deal.value, 0)
    const value = dealsValue || lead.dealValue || 0
    if (lead.stage.isMeetingStage) meetings += 1
    if (isSale) {
      sales += 1
      revenue += value
    }
    return {
      id: lead.id,
      name: lead.name || 'Sem nome',
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      clientType: lead.clientType,
      dealValue: value,
      isSale,
      createdAt: lead.createdAt,
      stage: { id: lead.stage.id, name: lead.stage.name, color: lead.stage.color },
    }
  })

  return NextResponse.json({
    summary: { totalLeads: leads.length, meetings, sales, revenue },
    funnel: stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      order: stage.order,
      count: countByStage.get(stage.id) ?? 0,
    })),
    leads: leadRows,
  })
}
