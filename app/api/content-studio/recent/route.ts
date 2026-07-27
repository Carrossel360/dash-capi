import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Feed "Últimas criações" da tela inicial de Tarefas > Criação (antes de escolher um cliente)
// — mistura carrosséis e sites de todos os clientes, mais recentes primeiro, cada um já
// identificando de qual cliente é.
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { isAgency: true } })
  if (!ws?.isAgency || !['admin', 'manager'].includes(auth.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const [carousels, sites] = await Promise.all([
    prisma.carousel.findMany({
      where: { workspace: { isAgency: false } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, format: true, slides: true, updatedAt: true, workspaceId: true, workspace: { select: { name: true } } },
    }),
    prisma.siteProject.findMany({
      where: { workspace: { isAgency: false } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, status: true, files: true, updatedAt: true, workspaceId: true, workspace: { select: { name: true } } },
    }),
  ])

  const items = [
    ...carousels.map(c => ({ type: 'carousel' as const, id: c.id, title: c.title, format: c.format, slides: c.slides, updatedAt: c.updatedAt, clientId: c.workspaceId, clientName: c.workspace.name })),
    ...sites.map(s => ({ type: 'site' as const, id: s.id, title: s.title, status: s.status, files: s.files, updatedAt: s.updatedAt, clientId: s.workspaceId, clientName: s.workspace.name })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 12)

  return NextResponse.json({ items })
}
