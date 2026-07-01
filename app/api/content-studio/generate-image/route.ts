import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { generateSlideImage } from '@/lib/openai'
import { uploadMedia } from '@/lib/storage'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, format } = await req.json()

  if (!prompt) {
    return NextResponse.json({ error: 'prompt é obrigatório' }, { status: 400 })
  }

  try {
    const size = format === 'story' ? '1024x1792' : '1024x1024'
    const base64Image = await generateSlideImage(prompt, size)
    const url = await uploadMedia(base64Image, auth.workspaceId, 'image/png')
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[POST /api/content-studio/generate-image]', err)
    return NextResponse.json({ error: 'Erro ao gerar imagem com IA' }, { status: 502 })
  }
}
