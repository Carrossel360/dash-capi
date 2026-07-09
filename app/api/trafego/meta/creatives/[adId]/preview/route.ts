import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { fetchMetaAdPreview } from '@/lib/meta-ads'

export async function GET(req: NextRequest, { params }: { params: { adId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN não configurado' }, { status: 400 })

  try {
    const iframeSrc = await fetchMetaAdPreview(params.adId, accessToken)
    return NextResponse.json({ iframeSrc })
  } catch (err: any) {
    console.error('[/api/trafego/meta/creatives/[adId]/preview]', params.adId, err?.response?.data || err.message)
    return NextResponse.json({ error: 'Erro ao buscar preview' }, { status: 500 })
  }
}
