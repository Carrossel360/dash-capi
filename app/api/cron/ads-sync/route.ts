import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncWorkspace } from '@/lib/ads-sync'
import { syncWorkspaceInstagram } from '@/lib/social-sync'

// Disparado pelo cron-job.org a cada 1h. Header CRON_SECRET protege contra chamadas externas
// (mesmo padrão de app/api/cron/capi/route.ts).
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspaces = await prisma.workspace.findMany({
    where: { OR: [{ svcMetaAds: true }, { svcGoogleAds: true }, { svcSocialMedia: true }] },
  })

  let metaOk = 0, metaSkip = 0, metaErr = 0
  let googleOk = 0, googleSkip = 0, googleErr = 0
  let socialOk = 0, socialSkip = 0, socialErr = 0

  for (const workspace of workspaces) {
    const { meta, google } = await syncWorkspace(workspace)
    if (meta === 'ok') metaOk++
    else if (meta === 'skip') metaSkip++
    else { metaErr++; console.error('[cron/ads-sync] meta', workspace.id, meta.error) }

    if (google === 'ok') googleOk++
    else if (google === 'skip') googleSkip++
    else { googleErr++; console.error('[cron/ads-sync] google', workspace.id, google.error) }

    const social = await syncWorkspaceInstagram(workspace)
    if (social === 'ok') socialOk++
    else if (social === 'skip') socialSkip++
    else { socialErr++; console.error('[cron/ads-sync] social', workspace.id, social.error) }
  }

  return NextResponse.json({
    workspaces: workspaces.length,
    meta: { ok: metaOk, skip: metaSkip, error: metaErr },
    google: { ok: googleOk, skip: googleSkip, error: googleErr },
    social: { ok: socialOk, skip: socialSkip, error: socialErr },
  })
}
