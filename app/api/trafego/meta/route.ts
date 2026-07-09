import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange, previousRange, buildComparison } from '@/lib/trafego-period'

const COMPARISON_KEYS = [
  'spend', 'impressions', 'reach', 'link_clicks', 'results', 'ctr', 'cpc',
  'cost_per_result', 'messaging_conversations_started', 'cost_per_conversation', 'cpm',
]

const emptyKpis = {
  spend: 0, impressions: 0, reach: 0, link_clicks: 0, results: 0,
  resultsFromForm: 0, resultsFromConversas: 0,
  ctr: 0, cpc: 0, cost_per_result: 0, roas: null as number | null,
  leads_bc: null, messaging_conversations_started: null,
  cost_per_conversation: null, post_engagement: null,
  followers: null, profile_visits: null, cost_per_link_click: null, cpm: null,
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
      prisma.metaAdsDailyData.findMany({
        where: { workspaceId, ...(range ? { date: range } : {}) },
        orderBy: { date: 'asc' },
      }),
      prevRange
        ? prisma.metaAdsDailyData.findMany({ where: { workspaceId, date: prevRange } })
        : Promise.resolve([]),
      prisma.metaAdsData.findFirst({
        where: { workspaceId },
        orderBy: { period: 'desc' },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { currency: true },
      }),
    ])

    const curr = cs(ws?.currency)

    const cpm = (spend: number, impressions: number) => impressions > 0 ? (spend / impressions) * 1000 : 0
    const costPer = (spend: number, count: number) => count > 0 ? spend / count : 0

    // Campanhas de objetivo "Mensagens" reportam o resultado como conversa iniciada, não como
    // lead — `resultados` fica zerado nessas linhas mesmo a campanha estando ativa e performando.
    // Usa conversasIniciadas como fallback por linha (campanha/dia) pra não zerar indevidamente
    // quem mistura campanhas de lead com campanhas de mensagem no mesmo workspace.
    const resultOf = (r: (typeof daily)[number]) => (Number(r.resultados) || 0) || (Number(r.conversasIniciadas) || 0)

    // Usado tanto pro período atual quanto pro anterior (comparação percentual) — mesma
    // lógica de agregação, só troca as linhas de entrada.
    function buildAggregate(rows: typeof daily) {
      const sum = (key: string) => rows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)[key]) || 0), 0)
      const totalResults = rows.reduce((acc, r) => acc + resultOf(r), 0)
      // De onde veio cada linha somada em `results`: lead real (campanha de Cadastro/Formulário)
      // ou conversa iniciada usada como fallback (campanha de Mensagens sem lead). Só informativo
      // pro usuário entender a composição do número — não afeta o cálculo em si.
      let resultsFromForm = 0, resultsFromConversas = 0
      for (const r of rows) {
        const leads = Number(r.resultados) || 0
        if (leads > 0) resultsFromForm += leads
        else resultsFromConversas += Number(r.conversasIniciadas) || 0
      }
      return {
        spend:           sum('valorGasto'),
        impressions:     sum('impressoes'),
        reach:           sum('alcance'),
        link_clicks:     sum('cliques'),
        results:         totalResults,
        resultsFromForm,
        resultsFromConversas,
        ctr:             rows.length ? sum('ctr') / rows.length : 0,
        cpc:             rows.length ? sum('cpc') / rows.length : 0,
        cost_per_result: costPer(sum('valorGasto'), totalResults),
        messaging_conversations_started: sum('conversasIniciadas'),
        cost_per_conversation: costPer(sum('valorGasto'), sum('conversasIniciadas')),
        cpm:             cpm(sum('valorGasto'), sum('impressoes')),
      }
    }

    const kpis = daily.length > 0 ? {
      ...buildAggregate(daily),
      roas:            monthly?.roas ?? null,
      leads_bc: null,
      post_engagement: null,
      followers: null, profile_visits: null, cost_per_link_click: null,
      hasData: true,
    } : isRangedQuery ? emptyKpis : {
      // Sem dado diário e período = 'all': cai para o último mês importado do Supabase (histórico legado)
      spend:           monthly?.valorGasto ?? 0,
      impressions:     monthly?.impressoes ?? 0,
      reach:           monthly?.alcance ?? 0,
      link_clicks:     monthly?.cliques ?? 0,
      results:         monthly?.resultados ?? 0,
      ctr:             monthly?.ctr ?? 0,
      cpc:             monthly?.cpc ?? 0,
      cost_per_result: monthly?.custoResultado ?? 0,
      roas:            monthly?.roas ?? null,
      // Dado mensal legado (importado do Supabase) não tem conversas iniciadas por campanha.
      leads_bc: null, messaging_conversations_started: null,
      cost_per_conversation: null, post_engagement: null,
      followers: null, profile_visits: null, cost_per_link_click: null,
      cpm:             cpm(monthly?.valorGasto ?? 0, monthly?.impressoes ?? 0),
      hasData: monthly != null,
    }

    // Chart grouped by date
    const byDate = new Map<string, { gasto: number; leads: number }>()
    for (const r of daily) {
      const key = new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      const ex = byDate.get(key) ?? { gasto: 0, leads: 0 }
      byDate.set(key, {
        gasto: ex.gasto + (Number(r.valorGasto) || 0),
        leads: ex.leads + resultOf(r),
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
        leads:      ex.leads      + resultOf(r),
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

    return NextResponse.json({ kpis, chart, campaigns, comparison })
  } catch (err) {
    console.error('[/api/trafego/meta]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
