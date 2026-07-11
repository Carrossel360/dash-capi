import { prisma } from '@/lib/db'
import { dateRange, previousRange, buildComparison } from '@/lib/trafego-period'
import { fetchGoogleAdsConversionBreakdown, fetchGoogleAdsQualitySummary, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'

// Extraído de app/api/trafego/meta/route.ts e app/api/trafego/google/route.ts — as duas
// rotas viraram wrappers finos dessas funções (mesmo contrato HTTP, mesmo comportamento).
// Reutilizado também por lib/ai-reports.ts pra montar o snapshot que alimenta a IA.

const META_COMPARISON_KEYS = [
  'spend', 'impressions', 'reach', 'link_clicks', 'results', 'ctr', 'cpc',
  'cost_per_result', 'messaging_conversations_started', 'cost_per_conversation', 'cpm',
]

const GOOGLE_COMPARISON_KEYS = ['spend', 'impressions', 'clicks', 'conversions', 'ctr', 'cpc', 'cost_per_conversion']

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

function cs(currency: string | null | undefined) {
  return currency === 'USD' ? 'US$' : 'R$'
}

function mccForWorkspace(currency: string | null | undefined): GoogleAdsMcc {
  return currency === 'USD' ? 'US' : 'BR'
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function buildMetaTrafficSnapshot(workspaceId: string, period: string, from?: string | null, to?: string | null) {
  const range = dateRange(period, from, to)
  const isRangedQuery = period !== 'all'
  const prevRange = isRangedQuery ? previousRange(period, range) : undefined

  const emptyKpis = {
    spend: 0, impressions: 0, reach: 0, link_clicks: 0, results: 0,
    resultsFromForm: 0, resultsFromConversas: 0,
    ctr: 0, cpc: 0, cost_per_result: 0, roas: null as number | null,
    leads_bc: null, messaging_conversations_started: null,
    cost_per_conversation: null, post_engagement: null,
    followers: null, profile_visits: null, cost_per_link_click: null, cpm: null,
    hasData: false,
  }

  const [daily, dailyPrev, monthly, ws] = await Promise.all([
    prisma.metaAdsDailyData.findMany({
      where: { workspaceId, ...(range ? { date: range } : {}) },
      orderBy: { date: 'asc' },
    }),
    prevRange
      ? prisma.metaAdsDailyData.findMany({ where: { workspaceId, date: prevRange } })
      : Promise.resolve([]),
    prisma.metaAdsData.findFirst({ where: { workspaceId }, orderBy: { period: 'desc' } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { currency: true } }),
  ])

  const curr = cs(ws?.currency)
  const cpm = (spend: number, impressions: number) => impressions > 0 ? (spend / impressions) * 1000 : 0
  const costPer = (spend: number, count: number) => count > 0 ? spend / count : 0

  // Campanhas de objetivo "Mensagens" reportam o resultado como conversa iniciada, não como
  // lead — `resultados` fica zerado nessas linhas mesmo a campanha estando ativa e performando.
  // Usa conversasIniciadas como fallback por linha (campanha/dia) pra não zerar indevidamente
  // quem mistura campanhas de lead com campanhas de mensagem no mesmo workspace.
  const resultOf = (r: (typeof daily)[number]) => (Number(r.resultados) || 0) || (Number(r.conversasIniciadas) || 0)

  function buildAggregate(rows: typeof daily) {
    const sum = (key: string) => rows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)[key]) || 0), 0)
    const totalResults = rows.reduce((acc, r) => acc + resultOf(r), 0)
    let resultsFromForm = 0, resultsFromConversas = 0
    for (const r of rows) {
      const leads = Number(r.resultados) || 0
      if (leads > 0) resultsFromForm += leads
      else resultsFromConversas += Number(r.conversasIniciadas) || 0
    }
    return {
      spend: sum('valorGasto'),
      impressions: sum('impressoes'),
      reach: sum('alcance'),
      link_clicks: sum('cliques'),
      results: totalResults,
      resultsFromForm,
      resultsFromConversas,
      ctr: rows.length ? sum('ctr') / rows.length : 0,
      cpc: rows.length ? sum('cpc') / rows.length : 0,
      cost_per_result: costPer(sum('valorGasto'), totalResults),
      messaging_conversations_started: sum('conversasIniciadas'),
      cost_per_conversation: costPer(sum('valorGasto'), sum('conversasIniciadas')),
      cpm: cpm(sum('valorGasto'), sum('impressoes')),
    }
  }

  const kpis = daily.length > 0 ? {
    ...buildAggregate(daily),
    roas: monthly?.roas ?? null,
    leads_bc: null,
    post_engagement: null,
    followers: null, profile_visits: null, cost_per_link_click: null,
    hasData: true,
  } : isRangedQuery ? emptyKpis : {
    spend: monthly?.valorGasto ?? 0,
    impressions: monthly?.impressoes ?? 0,
    reach: monthly?.alcance ?? 0,
    link_clicks: monthly?.cliques ?? 0,
    results: monthly?.resultados ?? 0,
    ctr: monthly?.ctr ?? 0,
    cpc: monthly?.cpc ?? 0,
    cost_per_result: monthly?.custoResultado ?? 0,
    roas: monthly?.roas ?? null,
    leads_bc: null, messaging_conversations_started: null,
    cost_per_conversation: null, post_engagement: null,
    followers: null, profile_visits: null, cost_per_link_click: null,
    cpm: cpm(monthly?.valorGasto ?? 0, monthly?.impressoes ?? 0),
    hasData: monthly != null,
  }

  const byDate = new Map<string, { gasto: number; leads: number }>()
  for (const r of daily) {
    const key = new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const ex = byDate.get(key) ?? { gasto: 0, leads: 0 }
    byDate.set(key, { gasto: ex.gasto + (Number(r.valorGasto) || 0), leads: ex.leads + resultOf(r) })
  }
  const chart = Array.from(byDate.entries()).map(([dia, v]) => ({ dia, gasto: Math.round(v.gasto), leads: Math.round(v.leads), vendas: 0 }))

  const byCampaign = new Map<string, { gasto: number; impressoes: number; cliques: number; leads: number }>()
  for (const r of daily) {
    const name = r.campaignName ?? 'Sem campanha'
    const ex = byCampaign.get(name) ?? { gasto: 0, impressoes: 0, cliques: 0, leads: 0 }
    byCampaign.set(name, {
      gasto: ex.gasto + (Number(r.valorGasto) || 0),
      impressoes: ex.impressoes + (Number(r.impressoes) || 0),
      cliques: ex.cliques + (Number(r.cliques) || 0),
      leads: ex.leads + resultOf(r),
    })
  }
  const campaigns = Array.from(byCampaign.entries())
    .sort((a, b) => b[1].gasto - a[1].gasto)
    .map(([name, v]) => ({
      name,
      status: 'Ativo',
      gasto: `${curr} ${v.gasto.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
      impressoes: v.impressoes.toLocaleString('pt-BR'),
      cliques: v.cliques.toLocaleString('pt-BR'),
      ctr: v.impressoes ? `${((v.cliques / v.impressoes) * 100).toFixed(2)}%` : '0%',
      leads: v.leads,
      cpl: v.leads ? `${curr} ${(v.gasto / v.leads).toFixed(0)}` : '-',
      vendas: 0,
      roas: '-',
    }))

  const comparison = daily.length > 0 && dailyPrev.length > 0
    ? buildComparison(kpis, buildAggregate(dailyPrev), META_COMPARISON_KEYS)
    : {}

  return { kpis, chart, campaigns, comparison }
}

export async function buildGoogleTrafficSnapshot(workspaceId: string, period: string, from?: string | null, to?: string | null) {
  const range = dateRange(period, from, to)
  const isRangedQuery = period !== 'all'
  const prevRange = isRangedQuery ? previousRange(period, range) : undefined

  const emptyKpis = {
    spend: 0, impressions: 0, clicks: 0, conversions: 0,
    ctr: 0, cpc: 0, cost_per_conversion: 0, leads_bc: 0,
    roas: null as number | null, quality_score: null, search_impression_share: null,
    hasData: false,
  }

  const [daily, dailyPrev, monthly, ws] = await Promise.all([
    prisma.googleAdsDailyData.findMany({
      where: { workspaceId, ...(range ? { date: range } : {}) },
      orderBy: { date: 'asc' },
    }),
    prevRange
      ? prisma.googleAdsDailyData.findMany({ where: { workspaceId, date: prevRange } })
      : Promise.resolve([]),
    prisma.googleAdsData.findFirst({ where: { workspaceId }, orderBy: { period: 'desc' } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { currency: true, googleAdsCustomerId: true } }),
  ])

  const curr = cs(ws?.currency)

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
        console.error('[buildGoogleTrafficSnapshot] conversionsBreakdown/qualitySummary', err)
      }
    }
  }

  function buildAggregate(rows: typeof daily) {
    const sum = (key: string) => rows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)[key]) || 0), 0)
    return {
      spend: sum('valorGasto'),
      impressions: sum('impressoes'),
      clicks: sum('cliques'),
      conversions: sum('resultados'),
      ctr: rows.length ? sum('ctr') / rows.length : 0,
      cpc: rows.length ? sum('cpc') / rows.length : 0,
      cost_per_conversion: rows.length ? sum('custoResultado') / rows.length : 0,
      leads_bc: sum('leadesBc'),
    }
  }

  const kpis = daily.length > 0 ? {
    ...buildAggregate(daily),
    roas: null, quality_score: qualityScore, search_impression_share: searchImpressionShare,
    hasData: true,
  } : isRangedQuery ? emptyKpis : {
    spend: monthly?.valorGasto ?? 0,
    impressions: monthly?.impressoes ?? 0,
    clicks: monthly?.cliques ?? 0,
    conversions: monthly?.resultados ?? 0,
    ctr: monthly?.ctr ?? 0,
    cpc: monthly?.cpc ?? 0,
    cost_per_conversion: monthly?.custoResultado ?? 0,
    leads_bc: monthly?.leadesBc ?? 0,
    roas: null, quality_score: null, search_impression_share: null,
    hasData: monthly != null,
  }

  const byDate = new Map<string, { gasto: number; leads: number }>()
  for (const r of daily) {
    const key = new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const ex = byDate.get(key) ?? { gasto: 0, leads: 0 }
    byDate.set(key, { gasto: ex.gasto + (Number(r.valorGasto) || 0), leads: ex.leads + (Number(r.resultados) || 0) })
  }
  const chart = Array.from(byDate.entries()).map(([dia, v]) => ({ dia, gasto: Math.round(v.gasto), leads: Math.round(v.leads), vendas: 0 }))

  const byCampaign = new Map<string, { gasto: number; impressoes: number; cliques: number; leads: number }>()
  for (const r of daily) {
    const name = r.campaignName ?? 'Sem campanha'
    const ex = byCampaign.get(name) ?? { gasto: 0, impressoes: 0, cliques: 0, leads: 0 }
    byCampaign.set(name, {
      gasto: ex.gasto + (Number(r.valorGasto) || 0),
      impressoes: ex.impressoes + (Number(r.impressoes) || 0),
      cliques: ex.cliques + (Number(r.cliques) || 0),
      leads: ex.leads + (Number(r.resultados) || 0),
    })
  }
  const campaigns = Array.from(byCampaign.entries())
    .sort((a, b) => b[1].gasto - a[1].gasto)
    .map(([name, v]) => ({
      name,
      status: 'Ativo',
      gasto: `${curr} ${v.gasto.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
      impressoes: v.impressoes.toLocaleString('pt-BR'),
      cliques: v.cliques.toLocaleString('pt-BR'),
      ctr: v.impressoes ? `${((v.cliques / v.impressoes) * 100).toFixed(2)}%` : '0%',
      leads: v.leads,
      cpl: v.leads ? `${curr} ${(v.gasto / v.leads).toFixed(0)}` : '-',
      vendas: 0,
      roas: '-',
    }))

  const comparison = daily.length > 0 && dailyPrev.length > 0
    ? buildComparison(kpis, buildAggregate(dailyPrev), GOOGLE_COMPARISON_KEYS)
    : {}

  return { kpis, chart, campaigns, comparison, conversionsBreakdown }
}
