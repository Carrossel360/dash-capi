import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Edita a venda de um lead que JÁ está marcado como vendido — diferente de POST /api/deals
// (usado só na primeira vez, ao mover pro estágio de venda), aqui não muda de estágio, não
// mexe em closedAt e não reenvia o evento CAPI de Purchase (já foi enviado quando a venda foi
// registrada; reenviar a cada edição de valor/produto inflaria os dados de conversão da Meta).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items } = await req.json() as { items?: { productId: string | null; value: number }[] }

  const lead = await prisma.lead.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const validItems = (Array.isArray(items) ? items : []).filter(i => i.value > 0)
  const total = validItems.reduce((s, i) => s + i.value, 0)

  await prisma.deal.deleteMany({ where: { leadId: params.id } })
  const deals = await Promise.all(validItems.map(item => prisma.deal.create({
    data: {
      workspaceId: auth.workspaceId,
      leadId: params.id,
      productId: item.productId || null,
      value: item.value,
      status: 'won',
    },
    include: { product: true },
  })))

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data: { dealValue: total },
  })

  return NextResponse.json({ lead: updated, deals })
}
