import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma as db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await req.json()
  const project = await db.taskProject.updateMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
    data: { name: data.name, color: data.color },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.taskProject.deleteMany({ where: { id: params.id, workspaceId: auth.workspaceId } })
  return NextResponse.json({ ok: true })
}
