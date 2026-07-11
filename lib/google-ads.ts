import axios from 'axios'

export type GoogleAdsMcc = 'BR' | 'US'

interface MccCreds {
  developerToken: string
  loginCustomerId: string
  clientId: string
  clientSecret: string
  refreshToken: string
}

// Credenciais por MCC (a agência tem uma MCC no Brasil e outra nos EUA).
// Client ID/Secret também são por MCC, não compartilhados: um projeto do Google Cloud
// fica permanentemente vinculado ao primeiro developer token usado nele (comportamento
// da própria Google Ads API) — usar o mesmo Client ID pras duas MCCs faz a segunda travar
// com DEVELOPER_TOKEN_PROHIBITED assim que a primeira for autenticada.
// Faltam client_id/secret/refresh_token até o usuário concluir o consent OAuth2 —
// isGoogleAdsConfigured() protege as chamadas até essas env vars existirem.
function getMccCreds(mcc: GoogleAdsMcc): MccCreds {
  return {
    developerToken: process.env[`GOOGLE_ADS_DEV_TOKEN_${mcc}`] ?? '',
    loginCustomerId: process.env[`GOOGLE_ADS_LOGIN_CUSTOMER_ID_${mcc}`] ?? '',
    clientId: process.env[`GOOGLE_ADS_CLIENT_ID_${mcc}`] ?? '',
    clientSecret: process.env[`GOOGLE_ADS_CLIENT_SECRET_${mcc}`] ?? '',
    refreshToken: process.env[`GOOGLE_ADS_REFRESH_TOKEN_${mcc}`] ?? '',
  }
}

export function isGoogleAdsConfigured(mcc: GoogleAdsMcc): boolean {
  const creds = getMccCreds(mcc)
  return Object.values(creds).every(v => v.length > 0)
}

async function refreshGoogleAccessToken(creds: MccCreds): Promise<string> {
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  })
  return data.access_token
}

// Helper compartilhado por fetchGoogleAdsReport/fetchGoogleAdsKeywords/fetchGoogleAdsSearchTerms —
// mesma autenticação (refresh token -> access token) e mesmo formato de chamada (searchStream).
async function searchStream(mcc: GoogleAdsMcc, customerId: string, query: string): Promise<any[]> {
  const creds = getMccCreds(mcc)
  const accessToken = await refreshGoogleAccessToken(creds)

  const { data } = await axios.post(
    `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
    { query },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'login-customer-id': creds.loginCustomerId,
      },
    }
  )

  const results: any[] = []
  for (const batch of data) results.push(...(batch.results ?? []))
  return results
}

export interface GoogleAdsReportRow {
  date: string
  campaignId: string
  campaignName: string
  costMicros: number
  impressions: number
  clicks: number
  ctr: number
  averageCpcMicros: number
  conversions: number
}

interface FetchGoogleAdsReportOptions {
  mcc: GoogleAdsMcc
  customerId: string
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
}

// Busca relatório diário por campanha via Google Ads API (GAQL). Inativa até
// GOOGLE_ADS_CLIENT_ID_<mcc>/CLIENT_SECRET_<mcc> e GOOGLE_ADS_REFRESH_TOKEN_<mcc> serem configurados.
export async function fetchGoogleAdsReport({ mcc, customerId, since, until }: FetchGoogleAdsReportOptions): Promise<GoogleAdsReportRow[]> {
  // Local Services (campaign.advertising_channel_type = LOCAL_SERVICES) é outro produto —
  // cobrado por lead (ligação/mensagem/agendamento), não por clique, e o "resultado" de
  // verdade vem de um recurso totalmente diferente (local_services_lead), não de metrics
  // daqui. Sem esse filtro, o gasto dessas campanhas entrava somado no Google Ads normal.
  const query = `
    SELECT segments.date, campaign.id, campaign.name,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.ctr, metrics.average_cpc, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.advertising_channel_type != 'LOCAL_SERVICES'
  `

  const results = await searchStream(mcc, customerId, query)
  return results.map(r => ({
    date: r.segments.date,
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    costMicros: Number(r.metrics.costMicros ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
    ctr: Number(r.metrics.ctr ?? 0),
    averageCpcMicros: Number(r.metrics.averageCpc ?? 0),
  }))
}

export interface GoogleAdsKeywordRow {
  campaignName: string
  keyword: string
  matchType: string
  impressions: number
  clicks: number
  conversions: number
  costMicros: number
  ctr: number
}

// Palavras-chave (keyword_view) agregadas no período — busca sob demanda (não persiste em
// banco), mesmo padrão de fetchMetaAdCreatives: dado de granularidade alta, cardinalidade
// variável por cliente, não faz sentido guardar histórico diário por keyword.
export async function fetchGoogleAdsKeywords({ mcc, customerId, since, until }: FetchGoogleAdsReportOptions): Promise<GoogleAdsKeywordRow[]> {
  const query = `
    SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.ctr
    FROM keyword_view
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND ad_group_criterion.status = 'ENABLED'
    ORDER BY metrics.impressions DESC
    LIMIT 100
  `

  const results = await searchStream(mcc, customerId, query)
  return results.map(r => ({
    campaignName: r.campaign.name,
    keyword: r.adGroupCriterion.keyword.text,
    matchType: r.adGroupCriterion.keyword.matchType,
    impressions: Number(r.metrics.impressions ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
    costMicros: Number(r.metrics.costMicros ?? 0),
    ctr: Number(r.metrics.ctr ?? 0),
  }))
}

export interface GoogleAdsSearchTermRow {
  campaignName: string
  searchTerm: string
  status: string
  impressions: number
  clicks: number
  conversions: number
  costMicros: number
  ctr: number
}

// Termos de pesquisa reais que dispararam os anúncios (search_term_view) — diferente de
// keyword_view: aqui é o que a pessoa efetivamente digitou no Google, não a keyword configurada
// na campanha (útil pra achar termos novos pra adicionar como keyword ou negativar).
export async function fetchGoogleAdsSearchTerms({ mcc, customerId, since, until }: FetchGoogleAdsReportOptions): Promise<GoogleAdsSearchTermRow[]> {
  const query = `
    SELECT campaign.name, search_term_view.search_term, search_term_view.status,
           metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.ctr
    FROM search_term_view
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY metrics.impressions DESC
    LIMIT 100
  `

  const results = await searchStream(mcc, customerId, query)
  return results.map(r => ({
    campaignName: r.campaign.name,
    searchTerm: r.searchTermView.searchTerm,
    status: r.searchTermView.status,
    impressions: Number(r.metrics.impressions ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
    costMicros: Number(r.metrics.costMicros ?? 0),
    ctr: Number(r.metrics.ctr ?? 0),
  }))
}

export interface GoogleAdsConversionCategoryRow {
  category: string
  conversions: number
}

// Quebra o total de conversões por tipo (segments.conversion_action_category — enum
// padronizado da própria Google: PHONE_CALL_LEAD, SUBMIT_LEAD_FORM, BOOK_APPOINTMENT etc.),
// não por nome livre da ação de conversão (que varia por cliente e não agrupa bem).
// A API devolve uma linha por campanha (mesmo sem segments.date no SELECT — o agrupamento
// implícito continua incluindo a campanha), então soma-se por categoria aqui.
export async function fetchGoogleAdsConversionBreakdown({ mcc, customerId, since, until }: FetchGoogleAdsReportOptions): Promise<GoogleAdsConversionCategoryRow[]> {
  const query = `
    SELECT segments.conversion_action_category, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.advertising_channel_type != 'LOCAL_SERVICES'
  `

  const results = await searchStream(mcc, customerId, query)
  const totals = new Map<string, number>()
  for (const r of results) {
    const category = r.segments.conversionActionCategory as string
    const conversions = Number(r.metrics.conversions ?? 0)
    totals.set(category, (totals.get(category) ?? 0) + conversions)
  }
  return Array.from(totals.entries())
    .map(([category, conversions]) => ({ category, conversions }))
    .filter(r => r.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)
}

export interface GoogleAdsCampaignStatus {
  id: string
  name: string
  status: string
}

export interface GoogleAdsStatusSummary {
  customerStatus: string
  campaigns: GoogleAdsCampaignStatus[]
}

interface FetchGoogleAdsStatusesOptions {
  mcc: GoogleAdsMcc
  customerId: string
}

// Usado pelo monitoramento automático (lib/monitor.ts) — customer.status cobre suspensão/
// cancelamento da conta, campaign.status cobre pausa manual. REMOVED é excluído porque é
// definitivo (campanha excluída pra sempre), não faz sentido monitorar transição de estado nela.
export async function fetchGoogleAdsStatuses({ mcc, customerId }: FetchGoogleAdsStatusesOptions): Promise<GoogleAdsStatusSummary> {
  const query = `
    SELECT customer.status, campaign.id, campaign.name, campaign.status
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `

  const results = await searchStream(mcc, customerId, query)
  return {
    customerStatus: results[0]?.customer?.status ?? 'UNKNOWN',
    campaigns: results.map(r => ({
      id: r.campaign.id,
      name: r.campaign.name,
      status: r.campaign.status,
    })),
  }
}

export interface GoogleAdsQualitySummary {
  avgSearchImpressionShare: number | null // 0–100 (já em %, pronto pro fmt do frontend)
  avgQualityScore: number | null // 1–10
}

// Duas métricas sem equivalente direto em MetaAdsDailyData/GoogleAdsDailyData, por isso
// calculadas ao vivo (mesmo padrão de keywords/conversionsBreakdown), não persistidas:
// - search_impression_share só existe a nível de campanha, e só pra campanhas de Pesquisa
//   (Local/PMax/Smart não retornam o campo) — média ponderada por impressões.
// - quality_score só existe a nível de PALAVRA-CHAVE (não tem equivalente de conta/campanha),
//   e só quando o Google já acumulou volume suficiente pra calcular — keywords novas/de baixo
//   volume vêm sem o campo, por isso a média só soma quem tem nota.
export async function fetchGoogleAdsQualitySummary({ mcc, customerId, since, until }: FetchGoogleAdsReportOptions): Promise<GoogleAdsQualitySummary> {
  const campaignQuery = `
    SELECT metrics.search_impression_share, metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.advertising_channel_type = 'SEARCH'
  `
  const keywordQuery = `
    SELECT ad_group_criterion.quality_info.quality_score
    FROM keyword_view
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND ad_group_criterion.status = 'ENABLED'
  `

  const [campaignRows, keywordRows] = await Promise.all([
    searchStream(mcc, customerId, campaignQuery),
    searchStream(mcc, customerId, keywordQuery),
  ])

  let sisWeightedSum = 0, sisWeightTotal = 0
  for (const r of campaignRows) {
    const share = r.metrics?.searchImpressionShare
    const impressions = Number(r.metrics?.impressions ?? 0)
    if (share != null && impressions > 0) {
      sisWeightedSum += Number(share) * impressions
      sisWeightTotal += impressions
    }
  }

  let qsSum = 0, qsCount = 0
  for (const r of keywordRows) {
    const score = r.adGroupCriterion?.qualityInfo?.qualityScore
    if (score != null) {
      qsSum += Number(score)
      qsCount++
    }
  }

  return {
    avgSearchImpressionShare: sisWeightTotal > 0 ? (sisWeightedSum / sisWeightTotal) * 100 : null,
    avgQualityScore: qsCount > 0 ? qsSum / qsCount : null,
  }
}
