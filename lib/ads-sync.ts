import type { Workspace } from '@prisma/client'
import { prisma } from '@/lib/db'
import { fetchMetaInsights } from '@/lib/meta-ads'
import { fetchGoogleAdsReport, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'

const SYNC_WINDOW_DAYS = 3 // janela deslizante: reprocessa os últimos dias a cada sync, corrige atraso de atribuição

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function syncWindow(): { since: string; until: string } {
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - SYNC_WINDOW_DAYS)
  return { since: ymd(since), until: ymd(until) }
}

const f = (v: unknown): number | null => (v == null || v === '' ? null : parseFloat(String(v)))

export type SyncResult = 'ok' | 'skip' | { error: string }

// Linha agregada por conta usa esse id constante em vez de null: um índice único
// do Postgres não deduplica múltiplos NULL, então null geraria linhas duplicadas a cada sync.
const ACCOUNT_TOTAL_ID = 'account-total'

export async function syncWorkspaceMetaAds(workspace: Workspace): Promise<SyncResult> {
  if (!workspace.metaAdAccountId) return 'skip'
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return 'skip'

  try {
    const { since, until } = syncWindow()
    const rows = await fetchMetaInsights({ adAccountId: workspace.metaAdAccountId, accessToken, since, until })

    for (const r of rows) {
      await prisma.metaAdsDailyData.upsert({
        where: {
          workspaceId_date_campaignId: {
            workspaceId: workspace.id,
            date: new Date(r.date_start),
            campaignId: r.campaign_id ?? ACCOUNT_TOTAL_ID,
          },
        },
        create: {
          workspaceId: workspace.id,
          date: new Date(r.date_start),
          campaignId: r.campaign_id ?? ACCOUNT_TOTAL_ID,
          campaignName: r.campaign_name ?? null,
          valorGasto: f(r.spend),
          impressoes: f(r.impressions),
          alcance: f(r.reach),
          cliques: f(r.clicks),
          ctr: f(r.ctr),
          cpc: f(r.cpc),
        },
        update: {
          campaignName: r.campaign_name ?? null,
          valorGasto: f(r.spend),
          impressoes: f(r.impressions),
          alcance: f(r.reach),
          cliques: f(r.clicks),
          ctr: f(r.ctr),
          cpc: f(r.cpc),
        },
      })
    }
    return 'ok'
  } catch (err: any) {
    return { error: err?.response?.data?.error?.message || err.message }
  }
}

function mccForWorkspace(workspace: Workspace): GoogleAdsMcc {
  return workspace.currency === 'USD' ? 'US' : 'BR'
}

export async function syncWorkspaceGoogleAds(workspace: Workspace): Promise<SyncResult> {
  if (!workspace.googleAdsCustomerId) return 'skip'
  const mcc = mccForWorkspace(workspace)
  if (!isGoogleAdsConfigured(mcc)) return 'skip'

  try {
    const { since, until } = syncWindow()
    const rows = await fetchGoogleAdsReport({ mcc, customerId: workspace.googleAdsCustomerId, since, until })

    for (const r of rows) {
      await prisma.googleAdsDailyData.upsert({
        where: {
          workspaceId_date_campaignId: {
            workspaceId: workspace.id,
            date: new Date(r.date),
            campaignId: r.campaignId || ACCOUNT_TOTAL_ID,
          },
        },
        create: {
          workspaceId: workspace.id,
          date: new Date(r.date),
          campaignId: r.campaignId || ACCOUNT_TOTAL_ID,
          campaignName: r.campaignName ?? null,
          valorGasto: r.costMicros / 1_000_000,
          impressoes: r.impressions,
          cliques: r.clicks,
          ctr: r.ctr,
          cpc: r.averageCpcMicros / 1_000_000,
        },
        update: {
          campaignName: r.campaignName ?? null,
          valorGasto: r.costMicros / 1_000_000,
          impressoes: r.impressions,
          cliques: r.clicks,
          ctr: r.ctr,
          cpc: r.averageCpcMicros / 1_000_000,
        },
      })
    }
    return 'ok'
  } catch (err: any) {
    return { error: err?.response?.data?.[0]?.error?.message || err.message }
  }
}

export async function syncWorkspace(workspace: Workspace) {
  const [meta, google] = await Promise.all([
    syncWorkspaceMetaAds(workspace),
    syncWorkspaceGoogleAds(workspace),
  ])
  return { meta, google }
}
