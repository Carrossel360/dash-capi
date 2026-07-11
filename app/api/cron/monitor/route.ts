import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkMetaAdsHealth, checkGoogleAdsHealth, checkWhatsappHealth } from '@/lib/monitor'

// Chamado a cada 1-2h por um serviço de cron externo (cron-job.org — mesmo padrão de
// app/api/cron/capi). Cada checagem é isolada por workspace: erro num cliente não afeta
// os demais nem impede as outras duas checagens do mesmo cliente.
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [workspaces, agency] = await Promise.all([
    prisma.workspace.findMany({
      where: {
        OR: [
          { svcMetaAds: true },
          { svcGoogleAds: true },
          { uazapiInstanceName: { not: null } },
        ],
      },
      select: {
        id: true, name: true, svcMetaAds: true, svcGoogleAds: true,
        metaAdAccountId: true, googleAdsCustomerId: true, currency: true,
        uazapiUrl: true, uazapiInstanceName: true, uazapiToken: true,
      },
    }),
    prisma.workspace.findFirst({ where: { isAgency: true }, select: { uazapiAdminToken: true } }),
  ])

  let failed = 0

  for (const workspace of workspaces) {
    try {
      await checkMetaAdsHealth(workspace)
    } catch (err) {
      console.error(`[/api/cron/monitor] meta ${workspace.id}`, err)
      failed++
    }
    try {
      await checkGoogleAdsHealth(workspace)
    } catch (err) {
      console.error(`[/api/cron/monitor] google ${workspace.id}`, err)
      failed++
    }
    try {
      await checkWhatsappHealth(workspace, agency?.uazapiAdminToken ?? '')
    } catch (err) {
      console.error(`[/api/cron/monitor] whatsapp ${workspace.id}`, err)
      failed++
    }
  }

  return NextResponse.json({ workspaces: workspaces.length, failed })
}
