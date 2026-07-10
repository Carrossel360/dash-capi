import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange, previousRange, buildComparison } from '@/lib/trafego-period'

const COMPARISON_KEYS = [
  'views', 'reach', 'totalInteractions', 'likes', 'comments', 'shares', 'saves', 'replies',
  'profileVisits', 'websiteClicks', 'accountsEngaged', 'followersNet',
]

function sumKey(rows: { [k: string]: unknown }[], key: string): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = auth
    const period = req.nextUrl.searchParams.get('period') ?? '30d'
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    const range = dateRange(period, from, to)
    const prevRange = previousRange(period, range)

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { instagramAccountId: true } })

    const [daily, dailyPrev] = await Promise.all([
      prisma.socialMediaDailyData.findMany({
        where: { workspaceId, platform: 'instagram', ...(range ? { date: range } : {}) },
        orderBy: { date: 'asc' },
      }),
      prevRange
        ? prisma.socialMediaDailyData.findMany({ where: { workspaceId, platform: 'instagram', date: prevRange } })
        : Promise.resolve([]),
    ])

    function buildAggregate(rows: typeof daily) {
      // followersTotal só é gravado no dia em que o sync rodou (snapshot, não histórico) —
      // pega o mais recente não-nulo da janela em vez de somar (somar não faria sentido).
      const latestFollowersTotal = [...rows].reverse().find(r => r.followersTotal != null)?.followersTotal ?? null
      return {
        views:             sumKey(rows, 'views'),
        viewsPost:         sumKey(rows, 'viewsPost'),
        viewsStory:        sumKey(rows, 'viewsStory'),
        viewsReel:         sumKey(rows, 'viewsReel'),
        viewsCarousel:     sumKey(rows, 'viewsCarousel'),
        reach:             sumKey(rows, 'reach'),
        totalInteractions: sumKey(rows, 'totalInteractions'),
        interactionsPost:      sumKey(rows, 'interactionsPost'),
        interactionsStory:     sumKey(rows, 'interactionsStory'),
        interactionsReel:      sumKey(rows, 'interactionsReel'),
        interactionsCarousel:  sumKey(rows, 'interactionsCarousel'),
        likes:    sumKey(rows, 'likes'),
        comments: sumKey(rows, 'comments'),
        shares:   sumKey(rows, 'shares'),
        saves:    sumKey(rows, 'saves'),
        replies:  sumKey(rows, 'replies'),
        profileVisits:   sumKey(rows, 'profileVisits'),
        websiteClicks:   sumKey(rows, 'websiteClicks'),
        accountsEngaged: sumKey(rows, 'accountsEngaged'),
        followersNet:    sumKey(rows, 'followersNet'),
        followersTotal:  latestFollowersTotal,
      }
    }

    const kpis = daily.length > 0
      ? { ...buildAggregate(daily), hasData: true }
      : { spend: 0, views: 0, reach: 0, totalInteractions: 0, likes: 0, comments: 0, shares: 0, saves: 0, replies: 0, profileVisits: 0, websiteClicks: 0, accountsEngaged: 0, followersNet: 0, followersTotal: null, viewsPost: 0, viewsStory: 0, viewsReel: 0, viewsCarousel: 0, interactionsPost: 0, interactionsStory: 0, interactionsReel: 0, interactionsCarousel: 0, hasData: false }

    // Chart: visualizações e interações por dia
    const chart = daily.map(r => ({
      dia: new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      views: Number(r.views) || 0,
      interactions: Number(r.totalInteractions) || 0,
      reach: Number(r.reach) || 0,
    }))

    const comparison = daily.length > 0 && dailyPrev.length > 0
      ? buildComparison(kpis, buildAggregate(dailyPrev), COMPARISON_KEYS)
      : {}

    return NextResponse.json({
      kpis, chart, comparison,
      hasInstagram: !!ws?.instagramAccountId,
    })
  } catch (err) {
    console.error('[/api/social-media]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
