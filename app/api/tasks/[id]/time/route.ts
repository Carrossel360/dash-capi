import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const task = await prisma.task.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })

  if (body.action === 'start') {
    const running = await prisma.taskTimeEntry.findFirst({ where: { userId: auth.userId, endedAt: null } })
    if (running) return NextResponse.json({ error: 'Já existe um cronômetro em andamento', entry: running }, { status: 409 })
    const entry = await prisma.taskTimeEntry.create({
      data: { taskId: task.id, userId: auth.userId, userName: user?.name ?? 'Usuário', startedAt: new Date(), note: body.note ?? null },
    })
    return NextResponse.json({ entry }, { status: 201 })
  }

  if (body.action === 'stop') {
    const entry = await prisma.taskTimeEntry.findFirst({ where: { taskId: task.id, userId: auth.userId, endedAt: null }, orderBy: { startedAt: 'desc' } })
    if (!entry) return NextResponse.json({ error: 'Nenhum cronômetro ativo' }, { status: 404 })
    const endedAt = new Date()
    const durationSec = Math.max(0, Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 1000))
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.taskTimeEntry.update({ where: { id: entry.id }, data: { endedAt, durationSec } })
      await tx.task.update({ where: { id: task.id }, data: { timeSpentMinutes: { increment: Math.ceil(durationSec / 60) } } })
      return result
    })
    return NextResponse.json({ entry: updated })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
