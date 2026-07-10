import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const phrases = await prisma.trackingPhrase.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ phrases })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { phrase, source, campaign } = await req.json()
  if (!phrase || !source) {
    return NextResponse.json({ error: 'phrase e source são obrigatórios' }, { status: 400 })
  }

  const existing = await prisma.trackingPhrase.findFirst({
    where: { workspaceId: auth.workspaceId, phrase },
  })
  if (existing) return NextResponse.json({ error: 'Essa frase já está cadastrada' }, { status: 409 })

  const created = await prisma.trackingPhrase.create({
    data: { workspaceId: auth.workspaceId, phrase, source, campaign: campaign || null },
  })
  return NextResponse.json(created, { status: 201 })
}
