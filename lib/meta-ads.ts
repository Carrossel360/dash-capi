import axios from 'axios'

interface MetaInsightsOptions {
  adAccountId: string
  accessToken: string
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
}

export interface MetaInsightAction {
  action_type: string
  value: string
}

export interface MetaInsightRow {
  date_start: string
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  reach?: string
  frequency?: string
  clicks?: string
  ctr?: string
  cpc?: string
  actions?: MetaInsightAction[]
}

// Linha de insights aninhada em /ads (Análise de Criativos) — sem quebra por dia,
// por isso não tem date_start (diferente de MetaInsightRow, que vem de time_increment=1).
export interface MetaAdInsightRow {
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  cpm?: string
  cpc?: string
  actions?: MetaInsightAction[]
}

// Busca insights diários por campanha via Meta Graph API (Marketing API / ads_read).
// Não confundir com lib/meta-capi.ts, que envia eventos de conversão (produto diferente).
export async function fetchMetaInsights({ adAccountId, accessToken, since, until }: MetaInsightsOptions): Promise<MetaInsightRow[]> {
  const url = `https://graph.facebook.com/v21.0/act_${adAccountId}/insights`

  const { data } = await axios.get(url, {
    params: {
      access_token: accessToken,
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc,actions',
    },
  })

  return data.data ?? []
}

// Action types que a Meta usa pra "Conversa iniciada" (objetivo Mensagens — WhatsApp/Messenger/IG Direct).
export const MESSAGING_ACTION_TYPES = ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d']
// Action types de "Lead" (objetivo Cadastro/Lead Ads) — só aparecem em campanhas desse objetivo, sem ambiguidade.
export const LEAD_ACTION_TYPES = ['lead', 'onsite_conversion.lead_grouped']

export function sumActions(actions: MetaInsightAction[] | undefined, types: string[]): number {
  if (!actions) return 0
  return actions
    .filter(a => types.includes(a.action_type))
    .reduce((acc, a) => acc + (parseFloat(a.value) || 0), 0)
}

export interface MetaAdAccount {
  id: string // vem como "act_<id>" — normalizado sem o prefixo antes de retornar
  name: string
  account_status: number
  currency?: string
}

// Lista as contas de anúncio visíveis para o token da agência (System User com ads_read).
// Usado pelo dropdown de seleção em Clientes → [cliente] → Meta CAPI, no lugar de digitar o ID manualmente.
export async function fetchMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const { data } = await axios.get('https://graph.facebook.com/v21.0/me/adaccounts', {
    params: {
      access_token: accessToken,
      fields: 'id,name,account_status,currency',
      limit: 200,
    },
  })

  return (data.data ?? []).map((a: MetaAdAccount) => ({ ...a, id: a.id.replace(/^act_/, '') }))
}

export interface MetaAdCreative {
  id: string
  name: string
  status: string
  effective_status: string
  creative?: {
    thumbnail_url?: string
    image_url?: string
    video_id?: string
    body?: string
    title?: string
  }
  insights?: { data: MetaAdInsightRow[] }
}

interface FetchMetaAdCreativesOptions {
  adAccountId: string
  accessToken: string
  since: string
  until: string
}

// Busca anúncios + criativo (imagem/vídeo/texto) + métricas do período numa chamada só,
// usando o campo aninhado `insights` da Graph API — evita N+1 chamadas por anúncio.
// Usado pela tela de Análise de Criativos (não confundir com fetchMetaInsights, que é
// agregado por campanha pro dashboard geral).
export async function fetchMetaAdCreatives({ adAccountId, accessToken, since, until }: FetchMetaAdCreativesOptions): Promise<MetaAdCreative[]> {
  const url = `https://graph.facebook.com/v21.0/act_${adAccountId}/ads`

  const { data } = await axios.get(url, {
    params: {
      access_token: accessToken,
      limit: 100,
      fields: [
        'id,name,status,effective_status',
        'creative{thumbnail_url,image_url,video_id,body,title}',
        `insights.time_range(${JSON.stringify({ since, until })}){impressions,spend,clicks,ctr,cpm,cpc,actions}`,
      ].join(','),
    },
  })

  return data.data ?? []
}

export interface MetaVideoInfo {
  source: string | null
  permalinkUrl: string | null
}

// Busca dados reproduzíveis de um vídeo de criativo — só chamada sob demanda (ao abrir o
// modal de um criativo com vídeo), pra não pagar essa chamada extra por criativo na grade.
// `source` (arquivo direto) costuma vir vazio pra vídeos/Reels publicados numa Página —
// permissão de conteúdo que o token de ads (ads_read) não tem; nesse caso o frontend cai
// pro link `permalinkUrl` ("assistir no Facebook") em vez de travar esperando um player.
export async function fetchMetaVideoSource(videoId: string, accessToken: string): Promise<MetaVideoInfo> {
  const { data } = await axios.get(`https://graph.facebook.com/v21.0/${videoId}`, {
    params: { access_token: accessToken, fields: 'source,permalink_url' },
  })
  return {
    source: data.source ?? null,
    permalinkUrl: data.permalink_url ? `https://www.facebook.com${data.permalink_url}` : null,
  }
}
