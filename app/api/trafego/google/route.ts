import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange, previousRange, buildComparison } from '@/lib/trafego-period'

const COMPARISON_KEYS = ['spend', 'impressions', 'clicks', 'conversions', 'ctr', 'cpc', 'cost_per_conversion']

const emptyKpis = {
  spend: 0, impressions: 0, clicks: 0, conversions: 0,
  ctr: 0, cpc: 0, cost_per_conversion: 0, leads_bc: 0,
  roas: null as number | null, quality_score: null, search_impression_share: null,
  hasData: false,
}

function monthsInRange(gte: Date, lte: Date): string[] {
  const months = new Set<string>()
  const cur = new Date(gte.getFullYear(), gte.getMonth(), 1)
  const end = new Date(lte.getFullYear(), lte.getMonth(), 1)
  while (cur <= end) {
    months.add(cur.toISOString().slice(0, 7))
    cur.setMonth(cur.getMonth() + 1)
  }
  return Array.from(months)
}

function cs(currency: string | null | undefined) {
  return currency === 'USD' ? 'US$' : 'R$'
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = auth
    const period = req.nextUrl.searchParams.get('period') ?? 'all'
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    const range = dateRange(period, from, to)
    const isRangedQuery = period !== 'all'
    const prevRange = isRangedQuery ? previousRange(period, range) : undefined

    const [daily, dailyPrev, monthly, ws] = await Promise.all([
      prisma.googleAdsDailyData.findMany({
        where: { workspaceId, ...(range ? { date: range } : {}) },
        orderBy: { date: 'asc' },
      }),
      prevRange
        ? prisma.googleAdsDailyData.findMany({ where: { workspaceId, date: prevRange } })
        : Promise.resolve([]),
      prisma.googleAdsData.findFirst({
        where: { workspaceId },
        orderBy: { period: 'desc' },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { currency: true },
      }),
    ])

    const curr = cs(ws?.currency)

    // Usado tanto pro período atual quanto pro anterior (comparação percentual) — mesma
    // lógica de agregação, só troca as linhas de entrada.
    function buildAggregate(rows: typeof daily) {
      const sum = (key: string) => rows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)[key]) || 0), 0)
      return {
        spend:               sum('valorGasto'),
        impressions:         sum('impressoes'),
        clicks:              sum('cliques'),
        conversions:         sum('resultados'),
        ctr:                 rows.length ? sum('ctr') / rows.length : 0,
        cpc:                 rows.length ? sum('cpc') / rows.length : 0,
        cost_per_conversion: rows.length ? sum('custoResultado') / rows.length : 0,
        leads_bc:            sum('leadesBc'),
      }
    }

    const kpis = daily.length > 0 ? {
      ...buildAggregate(daily),
      roas:                null, quality_score: null, search_impression_share: null,
      hasData: true,
    } : isRangedQuery ? emptyKpis : {
      // Sem dado diário e período = 'all': cai para o último mês importado do Supabase (histórico legado)
      spend:               monthly?.valorGasto ?? 0,
      impressions:         monthly?.impressoes ?? 0,
      clicks:              monthly?.cliques ?? 0,
      conversions:         monthly?.resultados ?? 0,
      ctr:                 monthly?.ctr ?? 0,
      cpc:                 monthly?.cpc ?? 0,
      cost_per_conversion: monthly?.custoResultado ?? 0,
      leads_bc:            monthly?.leadesBc ?? 0,
      roas:                null, quality_score: null, search_impression_share: null,
      hasData: monthly != null,
    }

    // Chart by date
    const byDate = new Map<string, { gasto: number; leads: number }>()
    for (const r of daily) {
      const key = new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      const ex = byDate.get(key) ?? { gasto: 0, leads: 0 }
      byDate.set(key, {
        gasto: ex.gasto + (Number(r.valorGasto) || 0),
        leads: ex.leads + (Number(r.resultados) || 0),
      })
    }
    const chart = Array.from(byDate.entries()).map(([dia, v]) => ({
      dia, gasto: Math.round(v.gasto), leads: Math.round(v.leads), vendas: 0,
    }))

    // Campaigns
    const byCampaign = new Map<string, { gasto: number; impressoes: number; cliques: number; leads: number }>()
    for (const r of daily) {
      const name = r.campaignName ?? 'Sem campanha'
      const ex = byCampaign.get(name) ?? { gasto: 0, impressoes: 0, cliques: 0, leads: 0 }
      byCampaign.set(name, {
        gasto:      ex.gasto      + (Number(r.valorGasto)  || 0),
        impressoes: ex.impressoes + (Number(r.impressoes)  || 0),
        cliques:    ex.cliques    + (Number(r.cliques)     || 0),
        leads:      ex.leads      + (Number(r.resultados)  || 0),
      })
    }
    const campaigns = Array.from(byCampaign.entries())
      .sort((a, b) => b[1].gasto - a[1].gasto)
      .map(([name, v]) => ({
        name,
        status: 'Ativo',
        gasto:      `${curr} ${v.gasto.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
        impressoes: v.impressoes.toLocaleString('pt-BR'),
        cliques:    v.cliques.toLocaleString('pt-BR'),
        ctr:        v.impressoes ? `${((v.cliques / v.impressoes) * 100).toFixed(2)}%` : '0%',
        leads:      v.leads,
        cpl:        v.leads ? `${curr} ${(v.gasto / v.leads).toFixed(0)}` : '-',
        vendas:     0,
        roas:       '-',
      }))

    // Keywords: período específico usa o(s) mês(es) cobertos pelo range pedido;
    // 'all' cai para o último mês mensal importado (comportamento anterior).
    const keywordPeriods = range ? monthsInRange(range.gte, range.lte) : (monthly?.period ? [monthly.period] : [])
    const rawKeywords = keywordPeriods.length
      ? await prisma.googleAdsKeyword.findMany({
          where: { workspaceId, period: { in: keywordPeriods } },
          orderBy: { clicks: 'desc' },
          take: 20,
        })
      : []

    const matchLabel: Record<string, string> = {
      EXACT: 'Exata', PHRASE: 'Frase', BROAD: 'Ampla',
      exact: 'Exata', phrase: 'Frase', broad: 'Ampla',
    }
    const keywords = rawKeywords.map(k => ({
      keyword:     k.keyword,
      match:       matchLabel[k.matchType ?? ''] ?? k.matchType ?? '-',
      impressions: Math.round(Number(k.impressions)),
      clicks:      Math.round(Number(k.clicks)),
      ctr:         `${(Number(k.ctr) * 100).toFixed(1)}%`,
      cpc:         `${curr} ${Number(k.cpc).toFixed(2)}`,
      position:    null,
      quality:     null,
    }))

    const comparison = daily.length > 0 && dailyPrev.length > 0
      ? buildComparison(kpis, buildAggregate(dailyPrev), COMPARISON_KEYS)
      : {}

    return NextResponse.json({ kpis, chart, campaigns, keywords, comparison })
  } catch (err) {
    console.error('[/api/trafego/google]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
