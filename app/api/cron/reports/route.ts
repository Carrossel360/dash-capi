import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateAndSaveReport } from '@/lib/ai-reports'

// Chamado 1x/dia por um serviço de cron externo (cron-job.org — ver app/api/cron/capi
// para o mesmo padrão). Cada ReportConfig com enabled=true e frequencyDays vencidos
// gera um novo relatório; erro em um workspace não derruba os demais.
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configs = await prisma.reportConfig.findMany({
    where: { enabled: true },
    include: { workspace: { select: { id: true, svcMetaAds: true, svcGoogleAds: true } } },
  })

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const config of configs) {
    const dueAt = config.lastGeneratedAt
      ? new Date(config.lastGeneratedAt.getTime() + config.frequencyDays * 24 * 60 * 60 * 1000)
      : null
    const isDue = !dueAt || dueAt <= new Date()
    if (!isDue) { skipped++; continue }

    try {
      await generateAndSaveReport(config.workspace, config)
      generated++
    } catch (err) {
      console.error(`[/api/cron/reports] workspace ${config.workspaceId}`, err)
      failed++
    }
  }

  return NextResponse.json({ total: configs.length, generated, skipped, failed })
}
