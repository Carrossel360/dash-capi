import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const phrases = await prisma.trackingPhrase.findMany({
    where: { workspaceId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ phrases })
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

  const { phrase, source, campaign } = await req.json()
  if (!phrase || !source) {
    return NextResponse.json({ error: 'phrase e source são obrigatórios' }, { status: 400 })
  }

  const existing = await prisma.trackingPhrase.findFirst({
    where: { workspaceId: params.id, phrase },
  })
  if (existing) return NextResponse.json({ error: 'Essa frase já está cadastrada' }, { status: 409 })

  const created = await prisma.trackingPhrase.create({
    data: { workspaceId: params.id, phrase, source, campaign: campaign || null },
  })
  return NextResponse.json(created, { status: 201 })
}
