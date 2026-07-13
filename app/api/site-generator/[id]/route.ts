import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await prisma.siteProject.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

  return NextResponse.json(project)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, files } = await req.json()

  const project = await prisma.siteProject.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

  const updated = await prisma.siteProject.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(files !== undefined && { files }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await prisma.siteProject.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

  await prisma.siteProject.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
