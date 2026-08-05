import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { generatePostCopy } from '@/lib/openai'
import { generatePostCopyClaude } from '@/lib/anthropic'
import { generatePostCopyGemini } from '@/lib/gemini'

// Copy de post/criativo (legenda + hashtags) — diferente de /generate (slides de carrossel):
// aqui a saída é só texto pronto pra colar na publicação, sem estrutura visual.
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { topic, platform, tone, aiProvider, aiModel } = await req.json()

  if (!topic || !platform) {
    return NextResponse.json({ error: 'topic e platform são obrigatórios' }, { status: 400 })
  }

  try {
    const result = aiProvider === 'anthropic'
      ? await generatePostCopyClaude({ topic, platform, tone, model: aiModel })
      : aiProvider === 'gemini'
      ? await generatePostCopyGemini({ topic, platform, tone, model: aiModel })
      : await generatePostCopy({ topic, platform, tone })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/content-studio/generate-copy]', err)
    return NextResponse.json({ error: 'Erro ao gerar copy com IA' }, { status: 502 })
  }
}
