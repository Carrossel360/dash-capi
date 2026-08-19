import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

const DEFAULTS = [
  { key: 'todo', name: 'A Fazer', color: '#64748b', category: 'backlog', position: 0 },
  { key: 'in_progress', name: 'Em Progresso', color: '#2575fc', category: 'active', position: 1 },
  { key: 'in_review', name: 'Em Revisão', color: '#F5A314', category: 'review', position: 2 },
  { key: 'done', name: 'Concluído', color: '#10b981', category: 'closed', position: 3 },
]

async function ensureDefaults(workspaceId: string) {
  if (await prisma.taskStatus.count({ where: { workspaceId } })) return
  await prisma.taskStatus.createMany({ data: DEFAULTS.map(status => ({ ...status, workspaceId })) })
}
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureDefaults(auth.workspaceId)
  const statuses = await prisma.taskStatus.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { position: 'asc' },
  })
  return NextResponse.json({ statuses })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const count = await prisma.taskStatus.count({ where: { workspaceId: auth.workspaceId } })
  const key = `${body.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'status'}_${Date.now().toString(36)}`
  const status = await prisma.taskStatus.create({
    data: {
      workspaceId: auth.workspaceId,
      spaceId: body.spaceId ?? null,
      folderId: body.folderId ?? null,
      projectId: body.projectId ?? null,
      key,
      name: body.name.trim(),
      color: body.color ?? '#64748b',
      category: body.category ?? 'active',
      position: count,
    },
  })
  return NextResponse.json({ status }, { status: 201 })
}
