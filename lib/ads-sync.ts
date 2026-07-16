import type { Workspace } from '@prisma/client'
import { prisma } from '@/lib/db'
import { fetchMetaInsights, sumActions, leadCount, MESSAGING_ACTION_TYPES } from '@/lib/meta-ads'
import { fetchGoogleAdsReport, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'

// Janela deslizante: reprocessa os últimos N dias a cada sync (corrige atraso de atribuição
// e faz upsert de novo em cima de dias já sincronizados). 30 dias garante que o filtro de
// período "Últimos 30 dias" na tela sempre tenha os dados completos, sem depender de backfill manual.
const SYNC_WINDOW_DAYS = 30

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// UTC (setUTCDate), não fuso local — mesmo motivo do lib/trafego-period.ts: garante que a
// janela de dias bata com a data (UTC-midnight) gravada em MetaAdsDailyData/GoogleAdsDailyData
// independente do fuso do processo rodando o cron.
function syncWindow(): { since: string; until: string } {
  const until = new Date()
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - SYNC_WINDOW_DAYS)
  return { since: ymd(since), until: ymd(until) }
}

const f = (v: unknown): number | null => (v == null || v === '' ? null : parseFloat(String(v)))

export type SyncResult = 'ok' | 'skip' | { error: string }

// Linha agregada por conta usa esse id constante em vez de null: um índice único
// do Postgres não deduplica múltiplos NULL, então null geraria linhas duplicadas a cada sync.
const ACCOUNT_TOTAL_ID = 'account-total'

export async function syncWorkspaceMetaAds(workspace: Workspace): Promise<SyncResult> {
  if (!workspace.metaAdAccountId) return 'skip'
  const { since, until } = syncWindow()
  return syncMetaAdsRange(workspace, since, until)
}

// Mesmo motivo do backfill de Google Ads: se a conta de anúncio só foi vinculada ao workspace
// bem depois de o cliente já estar ativo, os dias que já tinham "envelhecido" pra fora da
// janela móvel de 30 dias antes do primeiro sync nunca são cobertos pelo cron normal.
export async function backfillWorkspaceMetaAds(workspace: Workspace, fromDate: string, toDate: string): Promise<SyncResult> {
  if (!workspace.metaAdAccountId) return 'skip'
  return syncMetaAdsRange(workspace, fromDate, toDate)
}

async function syncMetaAdsRange(workspace: Workspace, since: string, until: string): Promise<SyncResult> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return 'skip'

  try {
    const rows = await fetchMetaInsights({ adAccountId: workspace.metaAdAccountId!, accessToken, since, until })

    for (const r of rows) {
      const conversasIniciadas = sumActions(r.actions, MESSAGING_ACTION_TYPES)
      const leads = leadCount(r.actions)
      const spend = f(r.spend) ?? 0

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
          frequencia: f(r.frequency),
          cliques: f(r.clicks),
          ctr: f(r.ctr),
          cpc: f(r.cpc),
          conversasIniciadas,
          resultados: leads,
          custoResultado: leads > 0 ? spend / leads : 0,
        },
        update: {
          campaignName: r.campaign_name ?? null,
          valorGasto: f(r.spend),
          impressoes: f(r.impressions),
          alcance: f(r.reach),
          frequencia: f(r.frequency),
          cliques: f(r.clicks),
          ctr: f(r.ctr),
          cpc: f(r.cpc),
          conversasIniciadas,
          resultados: leads,
          custoResultado: leads > 0 ? spend / leads : 0,
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
  const { since, until } = syncWindow()
  return syncGoogleAdsRange(workspace, since, until)
}

// Preenche retroativamente um range de datas que o sync horário (janela móvel de
// SYNC_WINDOW_DAYS) nunca cobriu — mesmo motivo do backfill de Instagram: se a conta de
// anúncio só foi configurada muito depois de o cliente já estar ativo, os dias mais antigos
// que "envelheceram" pra fora da janela de 30 dias antes do primeiro sync nunca são
// alcançados pelo cron normal e ficam faltando pra sempre sem isso. Diferente do Instagram,
// aqui não há limite de retenção da API pra métricas de custo/clique — o histórico completo
// da conta está disponível, então o backfill sempre consegue fechar a lacuna de verdade.
export async function backfillWorkspaceGoogleAds(workspace: Workspace, fromDate: string, toDate: string): Promise<SyncResult> {
  if (!workspace.googleAdsCustomerId) return 'skip'
  return syncGoogleAdsRange(workspace, fromDate, toDate)
}

async function syncGoogleAdsRange(workspace: Workspace, since: string, until: string): Promise<SyncResult> {
  const mcc = mccForWorkspace(workspace)
  if (!isGoogleAdsConfigured(mcc)) return 'skip'

  try {
    const rows = await fetchGoogleAdsReport({ mcc, customerId: workspace.googleAdsCustomerId!, since, until })

    for (const r of rows) {
      const spend = r.costMicros / 1_000_000
      const conversions = Math.round(r.conversions)
      const custoResultado = conversions > 0 ? spend / conversions : 0

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
          valorGasto: spend,
          impressoes: r.impressions,
          cliques: r.clicks,
          ctr: r.ctr,
          cpc: r.averageCpcMicros / 1_000_000,
          resultados: conversions,
          custoResultado,
        },
        update: {
          campaignName: r.campaignName ?? null,
          valorGasto: spend,
          impressoes: r.impressions,
          cliques: r.clicks,
          ctr: r.ctr,
          cpc: r.averageCpcMicros / 1_000_000,
          resultados: conversions,
          custoResultado,
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
