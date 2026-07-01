import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { generateCarouselSlides } from '@/lib/openai'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { topic, slideCount, tone } = await req.json()

  if (!topic || !slideCount) {
    return NextResponse.json({ error: 'topic e slideCount são obrigatórios' }, { status: 400 })
  }

  try {
    const slides = await generateCarouselSlides({ topic, slideCount, tone })
    return NextResponse.json({ slides })
  } catch (err) {
    console.error('[POST /api/content-studio/generate]', err)
    return NextResponse.json({ error: 'Erro ao gerar slides com IA' }, { status: 502 })
  }
}
