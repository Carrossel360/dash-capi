import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caller = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: auth.userId } },
  })
  if (!caller || !['admin', 'manager'].includes(caller.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { role } = await req.json()
  const validRoles = ['admin', 'manager', 'attendant', 'viewer']
  if (!validRoles.includes(role)) return NextResponse.json({ error: 'Role inválida' }, { status: 400 })

  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: params.userId } },
    data: { role },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (params.userId === auth.userId) {
    return NextResponse.json({ error: 'Não é possível remover seu próprio acesso' }, { status: 400 })
  }

  const caller = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: auth.userId } },
  })
  if (!caller || !['admin', 'manager'].includes(caller.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: params.userId } },
  })

  return NextResponse.json({ ok: true })
}
