import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncWorkspace, syncWorkspaceLocalServices, syncWorkspaceMetaLeads } from '@/lib/ads-sync'
import { syncWorkspaceInstagram } from '@/lib/social-sync'

// Disparado pelo cron-job.org a cada 1h. Header CRON_SECRET protege contra chamadas externas
// (mesmo padrão de app/api/cron/capi/route.ts).
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspaces = await prisma.workspace.findMany({
    where: { OR: [{ svcMetaAds: true }, { svcGoogleAds: true }, { svcSocialMedia: true }, { svcGoogleLocal: true }, { metaPageId: { not: null } }] },
  })

  let metaOk = 0, metaSkip = 0, metaErr = 0
  let googleOk = 0, googleSkip = 0, googleErr = 0
  let socialOk = 0, socialSkip = 0, socialErr = 0
  let localOk = 0, localSkip = 0, localErr = 0
  let leadsOk = 0, leadsSkip = 0, leadsErr = 0

  // Workspaces em paralelo (eram sequenciais) — com 20+ clientes, um por vez estourava
  // o timeout de 30s do cron-job.org (chegava a ~37s). Cada syncWorkspace/syncWorkspaceInstagram
  // já é uma função pura por workspace, sem estado compartilhado, então roda em paralelo com segurança.
  await Promise.all(workspaces.map(async workspace => {
    // Leads são o dado operacional mais sensível a atraso e levam bem menos tempo que
    // Local Services/insights. Executa primeiro para que um timeout do chamador não impeça
    // a entrada dos formulários no CRM. A rota /api/cron/meta-leads também permite rodar
    // somente esta etapa sem aguardar todas as integrações de mídia.
    const leads = await syncWorkspaceMetaLeads(workspace)
    if (leads === 'ok') leadsOk++
    else if (leads === 'skip') leadsSkip++
    else { leadsErr++; console.error('[cron/ads-sync] leads', workspace.id, leads.error) }

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

    // Só roda de verdade pra workspaces com localServicesAccountId configurado (skip imediato
    // pros demais) — cada chamada pode levar até ~25s (limitação da própria API, ver comentário
    // em lib/google-ads.ts), então só vale a pena pra quem realmente usa o serviço.
    const local = await syncWorkspaceLocalServices(workspace)
    if (local === 'ok') localOk++
    else if (local === 'skip') localSkip++
    else { localErr++; console.error('[cron/ads-sync] local', workspace.id, local.error) }

  }))

  return NextResponse.json({
    workspaces: workspaces.length,
    meta: { ok: metaOk, skip: metaSkip, error: metaErr },
    google: { ok: googleOk, skip: googleSkip, error: googleErr },
    social: { ok: socialOk, skip: socialSkip, error: socialErr },
    local: { ok: localOk, skip: localSkip, error: localErr },
    leads: { ok: leadsOk, skip: leadsSkip, error: leadsErr },
  })
}
