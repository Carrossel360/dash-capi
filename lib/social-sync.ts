import type { Workspace } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  fetchInstagramDailyMetrics,
  fetchInstagramFollowerNetByDay,
  fetchInstagramFollowersTotal,
  IG_SYNC_WINDOW_DAYS,
} from '@/lib/instagram'
import type { SyncResult } from '@/lib/ads-sync'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Dado orgânico do Instagram não tem atraso de atribuição como conversão de anúncio — os
// últimos IG_SYNC_WINDOW_DAYS (poucos dias) bastam pra corrigir qualquer atraso de contagem.
// Bem mais curto que os 30 dias usados pra Ads de propósito: cada dia aqui custa 2 chamadas
// (a API não permite pedir uma série de dias numa chamada só pra essas métricas).
export async function syncWorkspaceInstagram(workspace: Workspace): Promise<SyncResult> {
  const today = new Date()
  const dates: string[] = []
  for (let i = 0; i < IG_SYNC_WINDOW_DAYS; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(ymd(d))
  }
  return syncInstagramDates(workspace, dates)
}

// Preenche retroativamente um range de datas que o sync horário (janela móvel de
// IG_SYNC_WINDOW_DAYS) nunca cobriu — usado pelo botão "Buscar dados históricos" em
// Social Media quando o período selecionado (ex: mês anterior) não tem dados ainda.
// Sujeito ao limite real da Graph API pra insights históricos de Instagram (a Meta costuma
// não devolver dado além de ~30 dias pra trás pra algumas contas) — dias fora desse alcance
// simplesmente gravam zerado, sem erro.
export async function backfillWorkspaceInstagram(workspace: Workspace, fromDate: string, toDate: string): Promise<SyncResult> {
  const dates: string[] = []
  const cursor = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  while (cursor <= end) {
    dates.push(ymd(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return syncInstagramDates(workspace, dates)
}

async function syncInstagramDates(workspace: Workspace, dates: string[]): Promise<SyncResult> {
  if (!workspace.instagramAccountId) return 'skip'
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return 'skip'
  if (dates.length === 0) return 'ok'

  const sorted = [...dates].sort()
  const oldestDate = sorted[0]
  const newestDate = sorted[sorted.length - 1]
  const todayStr = ymd(new Date())

  // A Graph API rejeita follower_count (e possivelmente as métricas de dia) fora da janela de
  // retenção dela (normalmente ~30 dias) — isso não pode derrubar o backfill inteiro: dias dentro
  // da janela ainda devem ser gravados. Cada etapa falha isoladamente em vez de propagar.
  let followersTotal: number | null = null
  try {
    followersTotal = await fetchInstagramFollowersTotal(workspace.instagramAccountId, accessToken)
  } catch { /* segue sem snapshot de seguidores */ }

  let followerNetByDay: Record<string, number> = {}
  try {
    followerNetByDay = await fetchInstagramFollowerNetByDay(workspace.instagramAccountId, accessToken, oldestDate, newestDate)
  } catch { /* fora da janela de retenção da API — segue sem saldo líquido de seguidores */ }

  let lastError: string | undefined
  let successCount = 0
  for (const date of dates) {
    try {
      const m = await fetchInstagramDailyMetrics(workspace.instagramAccountId, accessToken, date)
      // Só "hoje" grava o snapshot atual de seguidores — não temos como reconstruir o total
      // histórico exato de dias passados, só o saldo líquido do dia (followerNetByDay).
      const followersTotalForDay = date === todayStr ? followersTotal : undefined

      await prisma.socialMediaDailyData.upsert({
        where: {
          workspaceId_date_platform: {
            workspaceId: workspace.id,
            date: new Date(date),
            platform: 'instagram',
          },
        },
        create: {
          workspaceId: workspace.id,
          date: new Date(date),
          platform: 'instagram',
          followersTotal: followersTotalForDay ?? null,
          followersNet: followerNetByDay[date] ?? null,
          views: m.views, viewsPost: m.viewsPost, viewsStory: m.viewsStory, viewsReel: m.viewsReel, viewsCarousel: m.viewsCarousel,
          reach: m.reach,
          totalInteractions: m.totalInteractions, interactionsPost: m.interactionsPost, interactionsStory: m.interactionsStory, interactionsReel: m.interactionsReel, interactionsCarousel: m.interactionsCarousel,
          likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, replies: m.replies,
          profileVisits: m.profileVisits, websiteClicks: m.websiteClicks, accountsEngaged: m.accountsEngaged,
        },
        update: {
          ...(followersTotalForDay !== undefined ? { followersTotal: followersTotalForDay } : {}),
          followersNet: followerNetByDay[date] ?? null,
          views: m.views, viewsPost: m.viewsPost, viewsStory: m.viewsStory, viewsReel: m.viewsReel, viewsCarousel: m.viewsCarousel,
          reach: m.reach,
          totalInteractions: m.totalInteractions, interactionsPost: m.interactionsPost, interactionsStory: m.interactionsStory, interactionsReel: m.interactionsReel, interactionsCarousel: m.interactionsCarousel,
          likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, replies: m.replies,
          profileVisits: m.profileVisits, websiteClicks: m.websiteClicks, accountsEngaged: m.accountsEngaged,
        },
      })
      successCount++
    } catch (err: any) {
      lastError = err?.response?.data?.error?.message || err.message
    }
  }

  if (successCount === 0 && lastError) return { error: lastError }
  return 'ok'
}
