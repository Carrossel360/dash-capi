import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function requireManage(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return membership && ['admin', 'manager'].includes(membership.role)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireManage(params.id, auth.userId))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { name, price, currency, description } = body

  const product = await prisma.product.findFirst({ where: { id: params.productId, workspaceId: params.id } })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.product.update({
    where: { id: params.productId },
    data: {
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price: Number(price) || 0 }),
      ...(currency !== undefined && { currency }),
      ...(description !== undefined && { description }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireManage(params.id, auth.userId))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const product = await prisma.product.findFirst({ where: { id: params.productId, workspaceId: params.id } })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Deal.productId é onDelete: SetNull — deals existentes não são afetados.
  await prisma.product.delete({ where: { id: params.productId } })
  return NextResponse.json({ ok: true })
}
