import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stageId = searchParams.get('stageId')
  const from    = searchParams.get('from')

  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(stageId ? { pipelineStageId: stageId } : {}),
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
    },
    include: { stage: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(leads)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, phone, email, source, stageId, dealValue, tags } = body

  if (!name || !stageId) {
    return NextResponse.json({ error: 'name e stageId são obrigatórios' }, { status: 400 })
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, workspaceId: auth.workspaceId },
  })
  if (!stage) return NextResponse.json({ error: 'Stage não encontrado' }, { status: 404 })

  const lead = await prisma.lead.create({
    data: {
      workspaceId: auth.workspaceId,
      name,
      phone,
      email,
      source,
      pipelineStageId: stageId,
      dealValue,
      tags: tags || [],
    },
    include: { stage: true },
  })

  return NextResponse.json(lead, { status: 201 })
}
