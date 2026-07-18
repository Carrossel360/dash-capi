import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Diferente do resto do Tráfego Pago, aqui não tem seletor de período livre (7d/30d/custom) —
// a Local Services Ads API só aceita ranges em escala de mês (ver lib/google-ads.ts), então o
// snapshot salvo é sempre "este mês" / "mês anterior" / "todo período" (ver lib/ads-sync.ts).
function resolvePeriod(period: string): string {
  const now = new Date()
  if (period === 'last_month') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  if (period === 'all') return 'all'
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const period = req.nextUrl.searchParams.get('period') ?? 'this_month'
    const resolvedPeriod = resolvePeriod(period)

    const workspace = await prisma.workspace.findUnique({
      where: { id: auth.workspaceId },
      select: { currency: true, localServicesAccountId: true },
    })

    const row = await prisma.googleLocalServicesData.findUnique({
      where: { workspaceId_period: { workspaceId: auth.workspaceId, period: resolvedPeriod } },
    })

    return NextResponse.json({
      hasAccount: !!workspace?.localServicesAccountId,
      currency: workspace?.currency ?? 'BRL',
      kpis: row
        ? {
            hasData: true,
            businessName: row.businessName,
            totalCost: row.totalCost ?? 0,
            chargedLeads: row.chargedLeads ?? 0,
            phoneCalls: row.phoneCalls ?? 0,
            connectedPhoneCalls: row.connectedPhoneCalls ?? 0,
            averageWeeklyBudget: row.averageWeeklyBudget,
            averageFiveStarRating: row.averageFiveStarRating,
            totalReview: row.totalReview,
            phoneLeadResponsiveness: row.phoneLeadResponsiveness,
            costPerLead: row.chargedLeads && row.chargedLeads > 0 ? (row.totalCost ?? 0) / row.chargedLeads : 0,
            updatedAt: row.updatedAt,
          }
        : { hasData: false },
    })
  } catch (err) {
    console.error('[/api/google-local]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
