import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { tagId } = await req.json()
  if (!tagId) return NextResponse.json({ error: 'tagId obrigatório' }, { status: 400 })

  await prisma.conversationTag.upsert({
    where:  { conversationId_tagId: { conversationId: params.id, tagId } },
    create: { conversationId: params.id, tagId },
    update: {},
  })

  return new NextResponse(null, { status: 204 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tagId = searchParams.get('tagId')
  if (!tagId) return NextResponse.json({ error: 'tagId obrigatório' }, { status: 400 })

  await prisma.conversationTag.deleteMany({
    where: { conversationId: params.id, tagId },
  })

  return new NextResponse(null, { status: 204 })
}
