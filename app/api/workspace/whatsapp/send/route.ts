import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { number, text } = await req.json()
  if (!number || !text) return NextResponse.json({ error: 'number e text são obrigatórios' }, { status: 400 })

  const ws = await prisma.workspace.findUnique({
    where:  { id: auth.workspaceId },
    select: { uazapiUrl: true, uazapiToken: true, uazapiInstanceName: true },
  })

  if (!ws?.uazapiUrl || !ws?.uazapiToken) {
    return NextResponse.json({ error: 'WhatsApp não configurado neste workspace' }, { status: 400 })
  }

  // Normalize phone: digits only
  const phone = number.replace(/\D/g, '')

  try {
    const res = await fetch(`${ws.uazapiUrl}/send/text`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', token: ws.uazapiToken },
      body:    JSON.stringify({ number: phone, text }),
    })
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data?.error ?? data?.message ?? 'Erro ao enviar mensagem' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao enviar' }, { status: 502 })
  }
}
