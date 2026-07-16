import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: { id: string; phraseId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  await prisma.trackingPhrase.deleteMany({
    where: { id: params.phraseId, workspaceId: params.id },
  })
  return NextResponse.json({ ok: true })
}
