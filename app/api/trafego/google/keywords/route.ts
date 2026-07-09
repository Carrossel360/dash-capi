import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchGoogleAdsKeywords, fetchGoogleAdsSearchTerms, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Mesma semântica de período das outras rotas de tráfego, resolvida direto em since/until —
// formato que a Graph/Google Ads API espera pra time_range/segments.date.
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
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 30 // 'all'/desconhecido cai pra 30d
  const since = new Date(now); since.setUTCDate(since.getUTCDate() - days)
  return { since: ymd(since), until: ymd(now) }
}

function mccForWorkspace(currency: string | null | undefined): GoogleAdsMcc {
  return currency === 'USD' ? 'US' : 'BR'
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
    if (!workspace?.googleAdsCustomerId) return NextResponse.json({ keywords: [], searchTerms: [] })

    const mcc = mccForWorkspace(workspace.currency)
    if (!isGoogleAdsConfigured(mcc)) return NextResponse.json({ error: `Google Ads (${mcc}) não configurado` }, { status: 400 })

    const period = req.nextUrl.searchParams.get('period') ?? '30d'
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    const { since, until } = resolveRange(period, from, to)

    const [keywordRows, searchTermRows] = await Promise.all([
      fetchGoogleAdsKeywords({ mcc, customerId: workspace.googleAdsCustomerId, since, until }),
      fetchGoogleAdsSearchTerms({ mcc, customerId: workspace.googleAdsCustomerId, since, until }),
    ])

    const keywords = keywordRows.map(k => ({
      campaign: k.campaignName,
      keyword: k.keyword,
      matchType: k.matchType,
      impressions: k.impressions,
      clicks: k.clicks,
      conversions: k.conversions,
      ctr: k.ctr,
      cost: k.costMicros / 1_000_000,
    }))

    const searchTerms = searchTermRows.map(t => ({
      campaign: t.campaignName,
      term: t.searchTerm,
      status: t.status,
      impressions: t.impressions,
      clicks: t.clicks,
      conversions: t.conversions,
      ctr: t.ctr,
      cost: t.costMicros / 1_000_000,
    }))

    return NextResponse.json({ keywords, searchTerms })
  } catch (err: any) {
    console.error('[/api/trafego/google/keywords]', err?.response?.data || err.message)
    return NextResponse.json(
      { error: err?.response?.data?.[0]?.error?.message || 'Erro ao buscar palavras-chave' },
      { status: 500 }
    )
  }
}
