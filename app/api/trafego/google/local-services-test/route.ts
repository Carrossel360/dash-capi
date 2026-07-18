import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Rota de diagnóstico temporária — só pra descobrir o formato real de resposta/erro da
// Local Services API antes de implementar a integração de verdade. Remover depois de validar.
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
  if (!workspace?.googleAdsCustomerId) return NextResponse.json({ error: 'sem googleAdsCustomerId' }, { status: 400 })

  const mcc = workspace.currency === 'USD' ? 'US' : 'BR'
  const developerToken = process.env[`GOOGLE_ADS_DEV_TOKEN_${mcc}`] ?? ''
  const loginCustomerId = process.env[`GOOGLE_ADS_LOGIN_CUSTOMER_ID_${mcc}`] ?? ''
  const clientId = process.env[`GOOGLE_ADS_CLIENT_ID_${mcc}`] ?? ''
  const clientSecret = process.env[`GOOGLE_ADS_CLIENT_SECRET_${mcc}`] ?? ''
  const refreshToken = process.env[`GOOGLE_ADS_REFRESH_TOKEN_${mcc}`] ?? ''

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) {
    return NextResponse.json({ step: 'token', error: tokenJson }, { status: 500 })
  }

  const until = new Date().toISOString().slice(0, 10)
  const sinceDate = new Date(); sinceDate.setUTCDate(sinceDate.getUTCDate() - 30)
  const since = sinceDate.toISOString().slice(0, 10)

  const query = `SELECT lead_type, lead_status, lead_charged, lead_price.currency_code, lead_price.amount_micros, lead_creation_time FROM detailed_lead_report WHERE lead_creation_time >= '${since} 00:00:00' AND lead_creation_time <= '${until} 23:59:59'`

  const res = await fetch('https://localservices.googleapis.com/v1/detailedLeadReports:search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'developer-token': developerToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const json = await res.json().catch(() => ({ raw: 'não-JSON' }))

  return NextResponse.json({
    workspace: workspace.name,
    customerId: workspace.googleAdsCustomerId,
    mcc,
    status: res.status,
    response: json,
  })
}
