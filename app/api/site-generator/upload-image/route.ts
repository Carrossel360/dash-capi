import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { uploadMedia } from '@/lib/storage'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { base64DataUrl, mimeType } = await req.json()
  if (!base64DataUrl) return NextResponse.json({ error: 'base64DataUrl é obrigatório' }, { status: 400 })

  try {
    const url = await uploadMedia(base64DataUrl, auth.workspaceId, mimeType)
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[/api/site-generator/upload-image]', err)
    return NextResponse.json({ error: 'Erro ao enviar imagem' }, { status: 502 })
  }
}
