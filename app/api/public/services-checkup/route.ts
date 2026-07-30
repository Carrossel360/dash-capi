import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyServicesCheckupToken } from '@/lib/services-checkup'
import { CORE_SERVICES } from '@/lib/services-catalog'

const CORE_KEYS = CORE_SERVICES.map(s => s.key)

// GET — lista todos os clientes (não a agência em si) com o estado atual de serviços, pro
// wizard público pré-marcar o que já se sabe e a pessoa só corrigir/completar.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!(await verifyServicesCheckupToken(token))) {
    return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 401 })
  }

  const workspaces = await prisma.workspace.findMany({
    where: { isAgency: false },
    select: {
      id: true, name: true, segment: true, isActive: true,
      svcMetaAds: true, svcGoogleAds: true, svcGoogleLocal: true, svcSocialMedia: true,
      svcGoogleBusiness: true, svcContentStudio: true, svcSiteGenerator: true,
      extraServices: { select: { key: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    clients: workspaces.map(w => ({ ...w, extraServices: w.extraServices.map(s => s.key) })),
  })
}

// POST — recebe o lote inteiro (todos os clientes já passados no wizard) e grava de uma vez.
// Cada cliente é atualizado em sua própria transação — se um falhar, os outros seguem, e a
// resposta lista os que falharam pra reportar na tela final.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, updates } = body as { token?: string; updates?: { workspaceId: string; services: Record<string, boolean>; extraServices: string[]; isActive?: boolean }[] }

  if (!token || !(await verifyServicesCheckupToken(token))) {
    return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 401 })
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'Nada pra salvar' }, { status: 400 })
  }

  const failed: string[] = []
  for (const u of updates) {
    try {
      const svcData: Record<string, boolean> = Object.fromEntries(
        CORE_KEYS.filter(k => typeof u.services?.[k] === 'boolean').map(k => [k, u.services[k]])
      )
      if (typeof u.isActive === 'boolean') svcData.isActive = u.isActive
      const extraKeys = Array.isArray(u.extraServices) ? u.extraServices : []
      await prisma.$transaction([
        prisma.workspace.update({ where: { id: u.workspaceId }, data: svcData }),
        prisma.workspaceService.deleteMany({ where: { workspaceId: u.workspaceId, key: { notIn: extraKeys } } }),
        ...extraKeys.map(key => prisma.workspaceService.upsert({
          where: { workspaceId_key: { workspaceId: u.workspaceId, key } },
          create: { workspaceId: u.workspaceId, key },
          update: {},
        })),
      ])
    } catch {
      failed.push(u.workspaceId)
    }
  }

  return NextResponse.json({ ok: true, saved: updates.length - failed.length, failed })
}
