import axios from 'axios'

interface MetaInsightsOptions {
  adAccountId: string
  accessToken: string
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
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
      fields: 'campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc',
    },
  })

  return data.data ?? []
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
