import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncWorkspaceMetaLeads } from '@/lib/ads-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Rota curta e independente para formulários nativos Meta. Evita que a entrada de leads
// dependa da conclusão do cron geral, que também consulta integrações mais lentas como
// Local Services, Google Ads e Instagram.
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspaces = await prisma.workspace.findMany({
    where: { metaPageId: { not: null } },
  })

  const results = await Promise.all(workspaces.map(async workspace => ({
    workspaceId: workspace.id,
    result: await syncWorkspaceMetaLeads(workspace),
  })))

  const errors = results.filter(item => typeof item.result === 'object')
  for (const item of errors) {
    console.error('[cron/meta-leads]', item.workspaceId, (item.result as { error: string }).error)
  }

  return NextResponse.json({
    workspaces: workspaces.length,
    ok: results.filter(item => item.result === 'ok').length,
    skip: results.filter(item => item.result === 'skip').length,
    error: errors.length,
  })
}
