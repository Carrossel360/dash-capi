import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange, previousRange, buildComparison } from '@/lib/trafego-period'
import { fetchGoogleAdsConversionBreakdown, fetchGoogleAdsQualitySummary, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'

// Rótulo em PT-BR pras categorias padronizadas de conversão da Google Ads API — cobre as mais
// comuns; categoria sem tradução cai pro nome bruto em minúsculas (melhor que sumir do card).
const CONVERSION_CATEGORY_LABELS: Record<string, string> = {
  PHONE_CALL_LEAD: 'chamada telefônica',
  IMPORTED_LEAD: 'lead importado',
  SUBMIT_LEAD_FORM: 'formulário',
  BOOK_APPOINTMENT: 'agendamento',
  REQUEST_QUOTE: 'orçamento',
  GET_DIRECTIONS: 'rota',
  DRIVING_DIRECTIONS: 'rota',
  OUTBOUND_CLICK: 'clique externo',
  CONTACT: 'contato',
  ENGAGEMENT: 'engajamento',
  STORE_VISIT: 'visita à loja',
  STORE_SALE: 'venda na loja',
  QUALIFIED_LEAD: 'lead qualificado',
  CONVERTED_LEAD: 'lead convertido',
  SIGNUP: 'cadastro',
  PAGE_VIEW: 'visualização de página',
  PURCHASE: 'compra',
  ADD_TO_CART: 'carrinho',
  BEGIN_CHECKOUT: 'checkout',
  SUBSCRIBE_PAID: 'assinatura',
  DOWNLOAD: 'download',
  SEARCH: 'pesquisa',
  DONATE: 'doação',
}

function mccForWorkspace(currency: string | null | undefined): GoogleAdsMcc {
  return currency === 'USD' ? 'US' : 'BR'
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const COMPARISON_KEYS = ['spend', 'impressions', 'clicks', 'conversions', 'ctr', 'cpc', 'cost_per_conversion']

const emptyKpis = {
  spend: 0, impressions: 0, clicks: 0, conversions: 0,
  ctr: 0, cpc: 0, cost_per_conversion: 0, leads_bc: 0,
  roas: null as number | null, quality_score: null, search_impression_share: null,
  hasData: false,
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
        select: { currency: true, googleAdsCustomerId: true },
      }),
    ])

    const curr = cs(ws?.currency)

    // Breakdown de conversões por tipo, Índice de Qualidade e Parcela de Impressões — busca
    // ao vivo na API, mesmo padrão de keywords/search terms: só fazem sentido pro período
    // selecionado atual, não persistem histórico (Quality Score só existe a nível de
    // keyword, Search Impr. Share só a nível de campanha de Pesquisa — nenhum dos dois tem
    // coluna equivalente em GoogleAdsDailyData). Pulado em 'Todo período' (sem range
    // concreto) e quando o cliente não tem Google Ads configurado.
    let conversionsBreakdown: { label: string; count: number }[] = []
    let qualityScore: number | null = null
    let searchImpressionShare: number | null = null
    if (range && ws?.googleAdsCustomerId) {
      const mcc = mccForWorkspace(ws.currency)
      if (isGoogleAdsConfigured(mcc)) {
        const since = ymd(range.gte), until = ymd(range.lte)
        try {
          const [breakdownRows, quality] = await Promise.all([
            fetchGoogleAdsConversionBreakdown({ mcc, customerId: ws.googleAdsCustomerId, since, until }),
            fetchGoogleAdsQualitySummary({ mcc, customerId: ws.googleAdsCustomerId, since, until }),
          ])
          conversionsBreakdown = breakdownRows.map(r => ({
            label: CONVERSION_CATEGORY_LABELS[r.category] ?? r.category.toLowerCase().replace(/_/g, ' '),
            count: r.conversions,
          }))
          qualityScore = quality.avgQualityScore != null ? Math.round(quality.avgQualityScore * 10) / 10 : null
          searchImpressionShare = quality.avgSearchImpressionShare != null ? Math.round(quality.avgSearchImpressionShare * 10) / 10 : null
        } catch (err) {
          console.error('[/api/trafego/google] conversionsBreakdown/qualitySummary', err)
        }
      }
    }

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
      roas: null, quality_score: qualityScore, search_impression_share: searchImpressionShare,
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

    const comparison = daily.length > 0 && dailyPrev.length > 0
      ? buildComparison(kpis, buildAggregate(dailyPrev), COMPARISON_KEYS)
      : {}

    return NextResponse.json({ kpis, chart, campaigns, comparison, conversionsBreakdown })
  } catch (err) {
    console.error('[/api/trafego/google]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
