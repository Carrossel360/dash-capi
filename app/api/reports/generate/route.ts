import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { REPORT_SERVICE, generateAndSaveReport, parseGeneratedReport } from '@/lib/ai-reports'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const [workspace, config] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: auth.workspaceId },
      select: { id: true, svcMetaAds: true, svcGoogleAds: true },
    }),
    prisma.reportConfig.upsert({
      where: { workspaceId_service: { workspaceId: auth.workspaceId, service: REPORT_SERVICE } },
      create: { workspaceId: auth.workspaceId, service: REPORT_SERVICE },
      update: {},
    }),
  ])

  if (!workspace) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })

  try {
    const insight = await generateAndSaveReport(workspace, config)
    return NextResponse.json({
      insight: { id: insight.id, period: insight.period, createdAt: insight.createdAt, report: parseGeneratedReport(insight.content) },
    })
  } catch (err) {
    console.error('[/api/reports/generate]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao gerar relatório' },
      { status: 500 }
    )
  }
}
