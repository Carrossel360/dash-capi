import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// period = YYYY-MM. Sem period, retorna os últimos 12 meses (mais recente primeiro).
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = req.nextUrl.searchParams.get('period')

  if (period) {
    const row = await prisma.googleBusinessData.findUnique({
      where: { workspaceId_period: { workspaceId: auth.workspaceId, period } },
    })
    return NextResponse.json({ data: row })
  }

  const rows = await prisma.googleBusinessData.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { period: 'desc' },
    take: 12,
  })
  return NextResponse.json({ data: rows.reverse() })
}

const NUMERIC_FIELDS = [
  'profileViews', 'phoneCalls', 'routeRequests', 'websiteVisits', 'chatMessages', 'whatsappClicks',
  'googleSearchViews', 'googleMapsViews', 'totalReviews', 'averageStars', 'newReviewsThisMonth',
  'reviewsWithoutComments', 'likesPositiveReviews', 'likesNegativeReviews', 'totalCitations',
  'routeSimulations', 'citationsThisMonth', 'profileRating', 'postsThisMonth', 'mapPositionAvg',
  'searchPositionAvg', 'competitorCount',
] as const

export async function PUT(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const body = await req.json()
  const { period, keywords, observations, ...rest } = body
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period deve estar no formato YYYY-MM' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const f of NUMERIC_FIELDS) {
    if (rest[f] !== undefined) data[f] = rest[f] === null ? null : Number(rest[f])
  }
  if (keywords !== undefined) data.keywords = keywords
  if (observations !== undefined) data.observations = observations

  const row = await prisma.googleBusinessData.upsert({
    where: { workspaceId_period: { workspaceId: auth.workspaceId, period } },
    update: data,
    create: { workspaceId: auth.workspaceId, period, ...data },
  })

  return NextResponse.json({ data: row })
}
