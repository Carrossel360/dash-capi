import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { fetchMetaAdAccounts } from '@/lib/meta-ads'

// Lista as contas de anúncio da Meta visíveis pro token de agência (System User, ads_read).
// Alimenta o dropdown de seleção em Clientes → [cliente] → Meta CAPI.
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN não configurado' }, { status: 400 })

  try {
    const accounts = await fetchMetaAdAccounts(accessToken)
    return NextResponse.json({ accounts })
  } catch (err: any) {
    console.error('[/api/meta/ad-accounts]', err?.response?.data || err.message)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || 'Erro ao buscar contas de anúncio' },
      { status: 500 }
    )
  }
}
