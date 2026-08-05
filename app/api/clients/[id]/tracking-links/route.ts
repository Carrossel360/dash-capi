import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Link curto rastreável — alternativa ao wa.me direto (que a agência já gera a partir de
// TrackingPhrase) pra medir clique real antes do redirect pro WhatsApp. GET público de
// /l/[slug] (fora deste arquivo) incrementa clickCount e redireciona.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const links = await prisma.trackingLink.findMany({
    where: { workspaceId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ links })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { trackingPhraseId } = await req.json()
  if (!trackingPhraseId) {
    return NextResponse.json({ error: 'trackingPhraseId é obrigatório' }, { status: 400 })
  }

  const phrase = await prisma.trackingPhrase.findFirst({
    where: { id: trackingPhraseId, workspaceId: params.id },
  })
  if (!phrase) return NextResponse.json({ error: 'Frase não encontrada' }, { status: 404 })

  const existing = await prisma.trackingLink.findUnique({ where: { trackingPhraseId } })
  if (existing) return NextResponse.json(existing)

  // Slug curto (6 bytes = 8 chars em base64url) — colisão improvável nessa escala, mas
  // tenta de novo com outro slug no caso raro do @unique rejeitar.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = crypto.randomBytes(6).toString('base64url')
    try {
      const created = await prisma.trackingLink.create({
        data: { workspaceId: params.id, slug, trackingPhraseId, phrase: phrase.phrase },
      })
      return NextResponse.json(created, { status: 201 })
    } catch (err: any) {
      if (err?.code === 'P2002' && attempt < 4) continue
      throw err
    }
  }
  return NextResponse.json({ error: 'Erro ao gerar link' }, { status: 500 })
}
