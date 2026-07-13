import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.siteProject.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description, characteristics, referenceImageUrls, aiProvider, aiModel } = await req.json()

  if (!title || !description) {
    return NextResponse.json({ error: 'title e description são obrigatórios' }, { status: 400 })
  }
  if (aiProvider && !['openai', 'anthropic'].includes(aiProvider)) {
    return NextResponse.json({ error: 'aiProvider inválido' }, { status: 400 })
  }

  const project = await prisma.siteProject.create({
    data: {
      workspaceId: auth.workspaceId,
      title,
      description,
      characteristics: characteristics || null,
      referenceImageUrls: referenceImageUrls ?? [],
      aiProvider: aiProvider ?? 'openai',
      aiModel: aiModel || null,
    },
  })

  return NextResponse.json(project, { status: 201 })
}
