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
// Faltam client_id/secret/refresh_token até o usuário concluir o consent OAuth2 —
// isGoogleAdsConfigured() protege as chamadas até essas env vars existirem.
function getMccCreds(mcc: GoogleAdsMcc): MccCreds {
  return {
    developerToken: process.env[`GOOGLE_ADS_DEV_TOKEN_${mcc}`] ?? '',
    loginCustomerId: process.env[`GOOGLE_ADS_LOGIN_CUSTOMER_ID_${mcc}`] ?? '',
    clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
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

export interface GoogleAdsReportRow {
  date: string
  campaignId: string
  campaignName: string
  costMicros: number
  impressions: number
  clicks: number
  ctr: number
  averageCpcMicros: number
}

interface FetchGoogleAdsReportOptions {
  mcc: GoogleAdsMcc
  customerId: string
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
}

// Busca relatório diário por campanha via Google Ads API (GAQL). Inativa até
// GOOGLE_ADS_CLIENT_ID/SECRET e GOOGLE_ADS_REFRESH_TOKEN_<mcc> serem configurados.
export async function fetchGoogleAdsReport({ mcc, customerId, since, until }: FetchGoogleAdsReportOptions): Promise<GoogleAdsReportRow[]> {
  const creds = getMccCreds(mcc)
  const accessToken = await refreshGoogleAccessToken(creds)

  const query = `
    SELECT segments.date, campaign.id, campaign.name,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `

  const { data } = await axios.post(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
    { query },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'login-customer-id': creds.loginCustomerId,
      },
    }
  )

  const rows: GoogleAdsReportRow[] = []
  for (const batch of data) {
    for (const r of batch.results ?? []) {
      rows.push({
        date: r.segments.date,
        campaignId: r.campaign.id,
        campaignName: r.campaign.name,
        costMicros: Number(r.metrics.costMicros ?? 0),
        impressions: Number(r.metrics.impressions ?? 0),
        clicks: Number(r.metrics.clicks ?? 0),
        ctr: Number(r.metrics.ctr ?? 0),
        averageCpcMicros: Number(r.metrics.averageCpc ?? 0),
      })
    }
  }
  return rows
}
