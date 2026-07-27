import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadMedia } from '@/lib/storage'

const CATEGORIES = ['id_comunicacao', 'id_visual', 'referencias']

// "Drive" de material por cliente dentro de Tarefas > Criação > Estúdio de Criação > Portfólio —
// só a agência gerencia (a tela nem existe pro lado cliente). Ver PortfolioAsset no schema.
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId obrigatório' }, { status: 400 })

  const assets = await prisma.portfolioAsset.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ assets })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { clientId, category, label, url, dataUrl } = await req.json()
  if (!clientId || !category || !label?.trim() || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'clientId, category e label obrigatórios' }, { status: 400 })
  }
  if (!url && !dataUrl) return NextResponse.json({ error: 'url ou dataUrl obrigatório' }, { status: 400 })

  const client = await prisma.workspace.findFirst({ where: { id: clientId, isAgency: false } })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const finalUrl = dataUrl ? await uploadMedia(dataUrl, clientId) : url
  const asset = await prisma.portfolioAsset.create({
    data: { clientId, category, label: label.trim(), url: finalUrl, type: dataUrl ? 'file' : 'link' },
  })

  return NextResponse.json({ asset }, { status: 201 })
}
