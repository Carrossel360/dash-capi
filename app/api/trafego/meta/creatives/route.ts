import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchMetaAdCreatives, sumActions, leadCount, MESSAGING_ACTION_TYPES } from '@/lib/meta-ads'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Mesma semântica de período das outras rotas de tráfego, mas resolvida direto em
// since/until (YYYY-MM-DD) — formato que a Graph API espera pra time_range.
// Em UTC (getUTCFullYear/Date.UTC), não fuso local — mesmo motivo do lib/trafego-period.ts:
// evita o cálculo de "mês atual"/"mês anterior" mudar de dia dependendo do fuso do servidor.
function resolveRange(period: string, from?: string | null, to?: string | null): { since: string; until: string } {
  const now = new Date()

  if (period === 'custom' && from && to) return { since: from, until: to }
  if (period === 'today') return { since: ymd(now), until: ymd(now) }
  if (period === 'yesterday') {
    const y = new Date(now); y.setUTCDate(y.getUTCDate() - 1)
    return { since: ymd(y), until: ymd(y) }
  }
  if (period === 'this_month') {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return { since: ymd(first), until: ymd(now) }
  }
  if (period === 'last_month') {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    return { since: ymd(first), until: ymd(last) }
  }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 30 // 'all'/desconhecido cai pra 30d — Insights exige um range concreto
  const since = new Date(now); since.setUTCDate(since.getUTCDate() - days)
  return { since: ymd(since), until: ymd(now) }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
    if (!workspace?.metaAdAccountId) return NextResponse.json({ creatives: [] })

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN não configurado' }, { status: 400 })

    const period = req.nextUrl.searchParams.get('period') ?? '30d'
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    const { since, until } = resolveRange(period, from, to)

    const ads = await fetchMetaAdCreatives({ adAccountId: workspace.metaAdAccountId, accessToken, since, until })
    const adIds = ads.map(ad => ad.id)
    const crmRows = adIds.length ? await prisma.lead.findMany({
      where: {
        workspaceId: auth.workspaceId,
        metaAdId: { in: adIds },
        createdAt: {
          gte: new Date(`${since}T00:00:00.000Z`),
          lte: new Date(`${until}T23:59:59.999Z`),
        },
      },
      select: {
        metaAdId: true,
        dealValue: true,
        closedAt: true,
        stage: { select: { isMeetingStage: true, triggerCapiEvent: true } },
        deals: { select: { value: true } },
      },
    }) : []
    const crmByAd = new Map<string, { leads: number; meetings: number; sales: number; revenue: number }>()
    for (const lead of crmRows) {
      if (!lead.metaAdId) continue
      const summary = crmByAd.get(lead.metaAdId) ?? { leads: 0, meetings: 0, sales: 0, revenue: 0 }
      const isSale = Boolean(lead.closedAt) || lead.stage.triggerCapiEvent === 'purchase'
      const dealsValue = lead.deals.reduce((total, deal) => total + deal.value, 0)
      summary.leads += 1
      if (lead.stage.isMeetingStage) summary.meetings += 1
      if (isSale) summary.sales += 1
      if (isSale) summary.revenue += dealsValue || lead.dealValue || 0
      crmByAd.set(lead.metaAdId, summary)
    }

    const creatives = ads.map(ad => {
      const row = ad.insights?.data?.[0]
      const spend = Number(row?.spend) || 0
      const leads = leadCount(row?.actions) + sumActions(row?.actions, MESSAGING_ACTION_TYPES)
      const crm = crmByAd.get(ad.id) ?? { leads: 0, meetings: 0, sales: 0, revenue: 0 }
      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        thumbnailUrl: ad.creative?.thumbnail_url ?? null,
        imageUrl: ad.creative?.image_url ?? null,
        videoId: ad.creative?.video_id ?? null,
        body: ad.creative?.body ?? null,
        title: ad.creative?.title ?? null,
        spend,
        impressions: Number(row?.impressions) || 0,
        clicks: Number(row?.inline_link_clicks) || 0,
        ctr: Number(row?.inline_link_click_ctr) || 0,
        cpm: Number(row?.cpm) || 0,
        cpc: Number(row?.cpc) || 0,
        leads,
        cpl: leads > 0 ? spend / leads : 0,
        crmLeads: crm.leads,
        meetings: crm.meetings,
        sales: crm.sales,
        revenue: crm.revenue,
      }
    })

    return NextResponse.json({ creatives, adAccountId: workspace.metaAdAccountId })
  } catch (err: any) {
    console.error('[/api/trafego/meta/creatives]', err?.response?.data || err.message)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || 'Erro ao buscar criativos' },
      { status: 500 }
    )
  }
}
