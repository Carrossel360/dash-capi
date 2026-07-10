import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchInstagramMedia } from '@/lib/instagram'

// Top Posts — busca ao vivo (não persiste), mesmo padrão da Análise de Criativos do Meta Ads:
// dado de mídia/engajamento que já muda pouco depois de publicado, sem necessidade de histórico
// diário. O front ordena/filtra client-side (mesmo padrão dos criativos).
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
    if (!workspace?.instagramAccountId) return NextResponse.json({ posts: [] })

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN não configurado' }, { status: 400 })

    const media = await fetchInstagramMedia(workspace.instagramAccountId, accessToken, 25)

    const posts = media.map(m => ({
      id: m.id,
      mediaType: m.mediaType,
      mediaProductType: m.mediaProductType,
      timestamp: m.timestamp,
      caption: m.caption,
      thumbnailUrl: m.thumbnailUrl,
      mediaUrl: m.mediaUrl,
      permalink: m.permalink,
      views: m.views,
      reach: m.reach,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      saved: m.saved,
      totalInteractions: m.totalInteractions,
      avgWatchTimeMs: m.avgWatchTimeMs,
    }))

    return NextResponse.json({ posts })
  } catch (err: any) {
    console.error('[/api/social-media/posts]', err?.response?.data || err.message)
    return NextResponse.json(
      { error: err?.response?.data?.error?.message || 'Erro ao buscar posts' },
      { status: 500 }
    )
  }
}
