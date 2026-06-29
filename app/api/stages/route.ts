import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stages = await prisma.pipelineStage.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { order: 'asc' },
  })

  return NextResponse.json(stages)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, color, order, triggerCapiEvent } = await req.json()
  if (!name) return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })

  const stage = await prisma.pipelineStage.create({
    data: {
      workspaceId: auth.workspaceId,
      name,
      color: color || '#6a11cb',
      order: order ?? 0,
      triggerCapiEvent: triggerCapiEvent || 'none',
    },
  })

  return NextResponse.json(stage, { status: 201 })
}
