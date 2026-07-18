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

  const query = `manager_customer_id:${loginCustomerId}`
  const params = new URLSearchParams({ query, pageSize: '100' })

  const res = await fetch(`https://localservices.googleapis.com/v1/accountReports:search?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'developer-token': developerToken,
      'login-customer-id': loginCustomerId,
    },
  })
  const json = await res.json().catch(() => ({ raw: 'não-JSON' }))

  return NextResponse.json({
    workspace: workspace.name,
    customerId: workspace.googleAdsCustomerId,
    mcc,
    loginCustomerId,
    status: res.status,
    response: json,
  })
}
