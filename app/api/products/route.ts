import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const products = await prisma.product.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ products })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, price, currency, description } = await req.json()
  if (!name) return NextResponse.json({ error: 'name obrigatório' }, { status: 400 })

  const product = await prisma.product.create({
    data: {
      workspaceId: auth.workspaceId,
      name,
      price: Number(price) || 0,
      currency: currency || 'BRL',
      description: description || null,
    },
  })

  return NextResponse.json(product, { status: 201 })
}
