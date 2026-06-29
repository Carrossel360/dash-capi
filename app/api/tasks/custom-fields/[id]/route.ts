import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await req.json()
  await prisma.customField.updateMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.options !== undefined && { options: data.options }),
      ...(data.required !== undefined && { required: data.required }),
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.customField.deleteMany({ where: { id: params.id, workspaceId: auth.workspaceId } })
  return NextResponse.json({ ok: true })
}
