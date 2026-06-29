import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

function hashPassword(p: string) {
  return crypto.createHash('sha256').update(p).digest('hex')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { role, password } = await req.json()

  if (password) {
    await prisma.user.update({
      where: { id: params.userId },
      data: { passwordHash: hashPassword(password) },
    })
  }

  if (role) {
    const validRoles = ['admin', 'manager', 'attendant', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Role inválida' }, { status: 400 })
    }
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: params.id, userId: params.userId } },
      data: { role },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (params.userId === auth.userId) {
    return NextResponse.json({ error: 'Não é possível remover seu próprio acesso' }, { status: 400 })
  }

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId: params.id, userId: params.userId } },
  })

  return NextResponse.json({ ok: true })
}
