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
  if (!workspace.instagramAccountId) return 'skip'
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return 'skip'

  try {
    const today = new Date()
    const dates: string[] = []
    for (let i = 0; i < IG_SYNC_WINDOW_DAYS; i++) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      dates.push(ymd(d))
    }
    const oldestDate = dates[dates.length - 1]
    const todayStr = dates[0]

    const [followersTotal, followerNetByDay] = await Promise.all([
      fetchInstagramFollowersTotal(workspace.instagramAccountId, accessToken),
      fetchInstagramFollowerNetByDay(workspace.instagramAccountId, accessToken, oldestDate, todayStr),
    ])

    for (const date of dates) {
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
    }

    return 'ok'
  } catch (err: any) {
    return { error: err?.response?.data?.error?.message || err.message }
  }
}
