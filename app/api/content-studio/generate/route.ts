import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { generateCarouselSlides } from '@/lib/openai'
import { generateCarouselSlidesClaude } from '@/lib/anthropic'
import { generateCarouselSlidesGemini } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { topic, slideCount, tone, aiProvider, aiModel } = await req.json()

  if (!topic || !slideCount) {
    return NextResponse.json({ error: 'topic e slideCount são obrigatórios' }, { status: 400 })
  }

  try {
    // OpenAI segue sendo o padrão (comportamento anterior preservado quando aiProvider não
    // é enviado) — Anthropic/Gemini são opt-in via seletor no Estúdio de Criação.
    const slides = aiProvider === 'anthropic'
      ? await generateCarouselSlidesClaude({ topic, slideCount, tone, model: aiModel })
      : aiProvider === 'gemini'
      ? await generateCarouselSlidesGemini({ topic, slideCount, tone, model: aiModel })
      : await generateCarouselSlides({ topic, slideCount, tone })
    return NextResponse.json({ slides })
  } catch (err) {
    console.error('[POST /api/content-studio/generate]', err)
    return NextResponse.json({ error: 'Erro ao gerar slides com IA' }, { status: 502 })
  }
}
