import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { REPORT_SERVICE, parseGeneratedReport } from '@/lib/ai-reports'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.insight.findMany({
    where: { workspaceId: auth.workspaceId, service: REPORT_SERVICE },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const insights = rows.map(row => {
    try {
      return { id: row.id, period: row.period, createdAt: row.createdAt, report: parseGeneratedReport(row.content) }
    } catch {
      return { id: row.id, period: row.period, createdAt: row.createdAt, report: null }
    }
  })

  return NextResponse.json({ insights })
}
