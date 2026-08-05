import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Import em lote — pra clientes cujo canal ainda não tem sync automático pro CRM (hoje é o
// caso do Local Service Ads: só relatório agregado, sem lead individual disponível na API).
// Mesmo padrão de dedupe por telefone/e-mail já usado nos outros canais (uazapi/elementor/
// ads-sync) — evita duplicar quem já chegou por outro caminho antes do import manual.
interface ImportRow {
  name?: string
  phone?: string
  email?: string
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  return digits ? `+${digits}` : null
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items, stageId, source } = await req.json() as { items?: ImportRow[]; stageId?: string; source?: string }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items é obrigatório e não pode ser vazio' }, { status: 400 })
  }
  if (items.length > 1000) {
    return NextResponse.json({ error: 'Máximo de 1000 leads por importação' }, { status: 400 })
  }

  const stage = stageId
    ? await prisma.pipelineStage.findFirst({ where: { id: stageId, workspaceId: auth.workspaceId } })
    : await prisma.pipelineStage.findFirst({ where: { workspaceId: auth.workspaceId }, orderBy: { order: 'asc' } })
  if (!stage) return NextResponse.json({ error: 'Nenhum estágio de pipeline encontrado' }, { status: 404 })

  const leadSource = source?.trim() || 'Importação Manual'

  let created = 0
  let duplicated = 0
  let invalid = 0

  for (const row of items) {
    const name = row.name?.trim() || ''
    const email = row.email?.trim() || null
    const phone = row.phone ? normalizePhone(row.phone) : null

    if (!phone && !email) { invalid++; continue }

    const crossSourceMatch = await prisma.lead.findFirst({
      where: {
        workspaceId: auth.workspaceId,
        OR: [
          phone ? { phone } : undefined,
          email ? { email } : undefined,
        ].filter(Boolean) as Prisma.LeadWhereInput[],
      },
      select: { id: true },
    })
    if (crossSourceMatch) { duplicated++; continue }

    await prisma.lead.create({
      data: {
        workspaceId: auth.workspaceId,
        name,
        phone,
        email,
        source: leadSource,
        utmMedium: 'Importação',
        pipelineStageId: stage.id,
      },
    })
    created++
  }

  return NextResponse.json({ ok: true, created, duplicated, invalid, total: items.length })
}
