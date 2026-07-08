import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, price, currency, description } = body

  const product = await prisma.product.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.product.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price: Number(price) || 0 }),
      ...(currency !== undefined && { currency }),
      ...(description !== undefined && { description }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await prisma.product.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Deal.productId é onDelete: SetNull — deals existentes não são afetados.
  await prisma.product.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
