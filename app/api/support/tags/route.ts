import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tags = await prisma.supportTag.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(tags)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, color } = await req.json()
  if (!name) return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })

  const tag = await prisma.supportTag.create({
    data: { workspaceId: auth.workspaceId, name, color: color ?? '#6a11cb' },
  })
  return NextResponse.json(tag, { status: 201 })
}
