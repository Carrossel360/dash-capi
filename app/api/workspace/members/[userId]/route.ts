import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

function hashPassword(p: string) {
  return crypto.createHash('sha256').update(p).digest('hex')
}

export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caller = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: auth.userId } },
  })
  if (!caller || !['admin', 'manager'].includes(caller.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { role, newPassword } = await req.json()

  if (role !== undefined) {
    const validRoles = ['admin', 'manager', 'attendant', 'viewer']
    if (!validRoles.includes(role)) return NextResponse.json({ error: 'Role inválida' }, { status: 400 })
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: params.userId } },
      data: { role },
    })
  }

  if (newPassword !== undefined) {
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 6 caracteres' }, { status: 400 })
    }
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: params.userId } },
    })
    if (!target) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    await prisma.user.update({ where: { id: params.userId }, data: { passwordHash: hashPassword(newPassword) } })
  }

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

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { isAgency: true },
  })

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: params.userId } },
  })

  // Acesso "Agência" é replicado em todos os clientes — remoção precisa ser simétrica.
  if (workspace?.isAgency) {
    await prisma.workspaceMember.deleteMany({
      where: { userId: params.userId, workspace: { isAgency: false } },
    })
  }

  return NextResponse.json({ ok: true })
}
