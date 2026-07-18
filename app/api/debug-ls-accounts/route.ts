import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'

// Rota de diagnóstico temporária — lista todas as contas de Local Services visíveis sob o
// manager_customer_id do MCC dos EUA, pra descobrir quais clientes já têm dado real disponível
// antes de configurar localServicesAccountId em cada um. Remover depois de usar.
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID_US ?? ''
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET_US ?? ''
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN_US ?? ''
  const developerToken = process.env.GOOGLE_ADS_DEV_TOKEN_US ?? ''
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID_US ?? ''

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) return NextResponse.json({ step: 'token', error: tokenJson }, { status: 500 })

  const params = new URLSearchParams({
    query: `manager_customer_id:${loginCustomerId}`,
    pageSize: '200',
    'startDate.year': '2015', 'startDate.month': '1', 'startDate.day': '1',
    'endDate.year': '2026', 'endDate.month': '7', 'endDate.day': '18',
  })

  try {
    const res = await fetch(`https://localservices.googleapis.com/v1/accountReports:search?${params}`, {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
      },
      signal: AbortSignal.timeout(25000),
    })
    const json = await res.json().catch(() => ({ raw: 'não-JSON' }))
    const accounts = (json.accountReports ?? []).map((r: any) => ({
      accountId: r.accountId,
      businessName: r.businessName,
      currentPeriodTotalCost: r.currentPeriodTotalCost,
      currentPeriodChargedLeads: r.currentPeriodChargedLeads,
    }))
    return NextResponse.json({ status: res.status, count: accounts.length, accounts })
  } catch (err: any) {
    return NextResponse.json({ step: 'fetch', error: err?.name === 'TimeoutError' ? 'TIMEOUT' : (err?.message || String(err)) }, { status: 504 })
  }
}
