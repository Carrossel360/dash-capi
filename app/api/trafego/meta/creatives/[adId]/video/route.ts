import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { fetchMetaVideoSource } from '@/lib/meta-ads'

// [adId] não é usado pra buscar nada (a fonte do vídeo vem só do videoId) — fica no
// path só pra manter a rota alinhada ao criativo que a chamou, útil em logs de erro.
export async function GET(req: NextRequest, { params }: { params: { adId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'videoId obrigatório' }, { status: 400 })

  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN não configurado' }, { status: 400 })

  try {
    const info = await fetchMetaVideoSource(videoId, accessToken)
    return NextResponse.json(info)
  } catch (err: any) {
    console.error('[/api/trafego/meta/creatives/[adId]/video]', params.adId, err?.response?.data || err.message)
    return NextResponse.json({ error: 'Erro ao buscar vídeo' }, { status: 500 })
  }
}
