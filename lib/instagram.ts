import axios from 'axios'

// Mesmo token de agência usado pra Meta Ads (META_ADS_ACCESS_TOKEN) — confirmado ao vivo que
// esse System User já tem os escopos de Instagram/Página (instagram_basic, instagram_manage_insights,
// pages_read_engagement, pages_show_list), além do ads_read usado em lib/meta-ads.ts. Não precisa
// de um token/app separado — só faltava popular workspace.instagramAccountId por cliente.

const GRAPH_VERSION = 'v23.0'

// A maioria das métricas de conta (views, reach, likes, comments, shares, saves, replies,
// profile_views, website_clicks, accounts_engaged) só aceita metric_type=total_value — não dá
// pra pedir uma série de dias numa chamada só, ao contrário do Meta/Google Ads. Por isso o sync
// pede um dia de cada vez (since=until=mesmo dia). Dado orgânico do Instagram não tem atraso de
// atribuição como conversão de anúncio, então uma janela curta (poucos dias) já basta — diferente
// dos 30 dias usados pra Ads.
export const IG_SYNC_WINDOW_DAYS = 3

const CONTENT_TYPE_KEYS = ['POST', 'STORY', 'REEL', 'CAROUSEL_CONTAINER'] as const

export interface InstagramDailyMetrics {
  date: string // YYYY-MM-DD
  views: number
  viewsPost: number
  viewsStory: number
  viewsReel: number
  viewsCarousel: number
  reach: number
  totalInteractions: number
  interactionsPost: number
  interactionsStory: number
  interactionsReel: number
  interactionsCarousel: number
  likes: number
  comments: number
  shares: number
  saves: number
  replies: number
  profileVisits: number
  websiteClicks: number
  accountsEngaged: number
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function fetchInsight(igAccountId: string, accessToken: string, params: Record<string, string>) {
  const { data } = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${igAccountId}/insights`, {
    params: { access_token: accessToken, ...params },
  })
  return data.data as { name: string; total_value?: { value: number; breakdowns?: { results: { dimension_values: string[]; value: number }[] }[] } }[]
}

function metricValue(rows: typeof fetchInsight extends (...a: any) => Promise<infer R> ? R : never, name: string): number {
  return Number(rows.find(r => r.name === name)?.total_value?.value ?? 0)
}

function contentBreakdown(rows: Awaited<ReturnType<typeof fetchInsight>>, name: string): Record<string, number> {
  const breakdowns = rows.find(r => r.name === name)?.total_value?.breakdowns?.[0]?.results ?? []
  const out: Record<string, number> = {}
  for (const b of breakdowns) out[b.dimension_values[0]] = Number(b.value)
  return out
}

// since/until de metric_type=total_value exigem epoch em SEGUNDOS — uma string "YYYY-MM-DD"
// é aceita sem erro, mas silenciosamente ignorada (a API cai pro padrão dela, o dia mais
// recente completo, não o dia pedido). Descoberto testando ao vivo: passar a data como string
// devolvia sempre os mesmos números não importa qual data fosse pedida.
function dayBoundsEpoch(date: string): { since: string; until: string } {
  const since = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
  const until = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000)
  return { since: String(since), until: String(until) }
}

// Busca as métricas de UM dia (a API não permite série de dias numa chamada só pra essas
// métricas). Duas chamadas: uma pra views/total_interactions com breakdown por tipo de
// conteúdo, outra pro resto (não precisa de breakdown).
export async function fetchInstagramDailyMetrics(igAccountId: string, accessToken: string, date: string): Promise<InstagramDailyMetrics> {
  const { since, until } = dayBoundsEpoch(date)
  const [breakdownRows, plainRows] = await Promise.all([
    fetchInsight(igAccountId, accessToken, {
      metric: 'views,total_interactions',
      metric_type: 'total_value',
      period: 'day',
      breakdown: 'media_product_type',
      since, until,
    }),
    fetchInsight(igAccountId, accessToken, {
      metric: 'reach,likes,comments,shares,saves,replies,profile_views,website_clicks,accounts_engaged',
      metric_type: 'total_value',
      period: 'day',
      since, until,
    }),
  ])

  const viewsByType = contentBreakdown(breakdownRows, 'views')
  const interactionsByType = contentBreakdown(breakdownRows, 'total_interactions')

  return {
    date,
    views: metricValue(breakdownRows, 'views'),
    viewsPost: viewsByType.POST ?? 0,
    viewsStory: viewsByType.STORY ?? 0,
    viewsReel: viewsByType.REEL ?? 0,
    viewsCarousel: viewsByType.CAROUSEL_CONTAINER ?? 0,
    totalInteractions: metricValue(breakdownRows, 'total_interactions'),
    interactionsPost: interactionsByType.POST ?? 0,
    interactionsStory: interactionsByType.STORY ?? 0,
    interactionsReel: interactionsByType.REEL ?? 0,
    interactionsCarousel: interactionsByType.CAROUSEL_CONTAINER ?? 0,
    reach: metricValue(plainRows, 'reach'),
    likes: metricValue(plainRows, 'likes'),
    comments: metricValue(plainRows, 'comments'),
    shares: metricValue(plainRows, 'shares'),
    saves: metricValue(plainRows, 'saves'),
    replies: metricValue(plainRows, 'replies'),
    profileVisits: metricValue(plainRows, 'profile_views'),
    websiteClicks: metricValue(plainRows, 'website_clicks'),
    accountsEngaged: metricValue(plainRows, 'accounts_engaged'),
  }
}

// follows_and_unfollows (o nome mais óbvio pra "seguidores líquidos") não funciona nem em
// total_value nem em time_series — testado ao vivo, API rejeita ou devolve vazio. follower_count
// é o que efetivamente funciona com metric_type=time_series, aceita um intervalo inteiro numa
// chamada só, e dá o saldo diário (apesar do texto de descrição da própria Meta chamar de
// "número total de seguidores" — o valor retornado por dia é claramente um delta pequeno, não
// o total acumulado). De qualquer forma, só o líquido: a API não expõe ganhos/perdas separados.
export async function fetchInstagramFollowerNetByDay(igAccountId: string, accessToken: string, since: string, until: string): Promise<Record<string, number>> {
  const { data } = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${igAccountId}/insights`, {
    params: {
      access_token: accessToken,
      metric: 'follower_count',
      metric_type: 'time_series',
      period: 'day',
      since, until,
    },
  })
  const values = data.data?.[0]?.values ?? []
  const out: Record<string, number> = {}
  for (const v of values) {
    out[String(v.end_time).slice(0, 10)] = Number(v.value)
  }
  return out
}

// followers_count é campo direto do node da conta (snapshot atual), não um insight —
// não tem granularidade diária, só "quantos seguidores agora".
export async function fetchInstagramFollowersTotal(igAccountId: string, accessToken: string): Promise<number> {
  const { data } = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${igAccountId}`, {
    params: { access_token: accessToken, fields: 'followers_count' },
  })
  return Number(data.followers_count ?? 0)
}

export interface InstagramMedia {
  id: string
  mediaType: string
  mediaProductType: string
  timestamp: string
  caption: string | null
  thumbnailUrl: string | null
  mediaUrl: string | null
  permalink: string | null
  views: number
  reach: number
  likes: number
  comments: number
  shares: number
  saved: number
  totalInteractions: number
  avgWatchTimeMs: number | null
}

// Top Posts — busca ao vivo (não persiste), mesmo padrão de fetchMetaAdCreatives: lista os
// posts recentes + insights de cada um. Vídeo/Reel expõe ig_reels_avg_watch_time; os demais
// tipos de mídia não aceitam essa métrica (a API rejeita com erro se pedida fora de Reels).
export async function fetchInstagramMedia(igAccountId: string, accessToken: string, limit = 25): Promise<InstagramMedia[]> {
  const { data } = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${igAccountId}/media`, {
    params: {
      access_token: accessToken,
      limit,
      fields: 'id,media_type,media_product_type,timestamp,caption,thumbnail_url,media_url,permalink',
    },
  })

  const items: any[] = data.data ?? []
  const results = await Promise.all(items.map(async (item): Promise<InstagramMedia> => {
    const isReel = item.media_product_type === 'REELS'
    const metrics = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions']
    if (isReel) metrics.push('ig_reels_avg_watch_time')

    let insightRows: { name: string; values?: { value: number }[] }[] = []
    try {
      const insightsRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${item.id}/insights`, {
        params: { access_token: accessToken, metric: metrics.join(',') },
      })
      insightRows = insightsRes.data.data ?? []
    } catch {
      // Alguns tipos de mídia (ex.: álbum de carrossel legado) podem rejeitar certas métricas —
      // não deixa um post quebrar a lista inteira, só fica com os campos zerados.
    }
    const val = (name: string) => Number(insightRows.find(r => r.name === name)?.values?.[0]?.value ?? 0)

    return {
      id: item.id,
      mediaType: item.media_type,
      mediaProductType: item.media_product_type,
      timestamp: item.timestamp,
      caption: item.caption ?? null,
      thumbnailUrl: item.thumbnail_url ?? null,
      mediaUrl: item.media_url ?? null,
      permalink: item.permalink ?? null,
      views: val('views'),
      reach: val('reach'),
      likes: val('likes'),
      comments: val('comments'),
      shares: val('shares'),
      saved: val('saved'),
      totalInteractions: val('total_interactions'),
      avgWatchTimeMs: isReel ? val('ig_reels_avg_watch_time') : null,
    }
  }))

  return results
}

export { ymd as ymdInstagram, CONTENT_TYPE_KEYS }
