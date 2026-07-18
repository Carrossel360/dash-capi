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

  const fromStr = req.nextUrl.searchParams.get('from') // YYYY-MM-DD, opcional
  const toStr = req.nextUrl.searchParams.get('to') // YYYY-MM-DD, opcional
  const query = `manager_customer_id:${loginCustomerId}`
  const paramsObj: Record<string, string> = { query, pageSize: '100' }
  if (fromStr) {
    const [y, m, d] = fromStr.split('-')
    paramsObj['startDate.year'] = y; paramsObj['startDate.month'] = String(Number(m)); paramsObj['startDate.day'] = String(Number(d))
  }
  if (toStr) {
    const [y, m, d] = toStr.split('-')
    paramsObj['endDate.year'] = y; paramsObj['endDate.month'] = String(Number(m)); paramsObj['endDate.day'] = String(Number(d))
  }
  const params = new URLSearchParams(paramsObj)

  const url = `https://localservices.googleapis.com/v1/accountReports:search?${params}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
      },
      signal: AbortSignal.timeout(25000),
    })
    const json = await res.json().catch(() => ({ raw: 'não-JSON' }))

    return NextResponse.json({
      workspace: workspace.name,
      customerId: workspace.googleAdsCustomerId,
      mcc,
      loginCustomerId,
      urlCalled: url,
      status: res.status,
      response: json,
    })
  } catch (err: any) {
    return NextResponse.json({
      workspace: workspace.name,
      urlCalled: url,
      step: 'fetch',
      error: err?.name === 'TimeoutError' ? 'TIMEOUT após 25s' : (err?.message || String(err)),
    }, { status: 504 })
  }
}
