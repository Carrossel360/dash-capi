import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const views = await prisma.taskSavedView.findMany({
    where: { workspaceId: auth.workspaceId, userId: auth.userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json({ views })
}
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (body.isDefault) await prisma.taskSavedView.updateMany({ where: { workspaceId: auth.workspaceId, userId: auth.userId }, data: { isDefault: false } })
  const view = await prisma.taskSavedView.create({
    data: {
      workspaceId: auth.workspaceId, userId: auth.userId, name: body.name.trim(),
      viewType: body.viewType ?? 'list', scopeType: body.scopeType ?? 'workspace', scopeId: body.scopeId ?? null,
      filters: body.filters ?? null, columns: body.columns ?? null, grouping: body.grouping ?? null,
      isDefault: Boolean(body.isDefault),
    },
  })
  return NextResponse.json({ view }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  await prisma.taskSavedView.deleteMany({ where: { id: id ?? '', workspaceId: auth.workspaceId, userId: auth.userId } })
  return NextResponse.json({ ok: true })
}
