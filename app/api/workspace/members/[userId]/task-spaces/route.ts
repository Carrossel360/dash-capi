import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Gerencia a que Espaços de Tarefas um membro da equipe (role viewer) tem acesso —
// implementa a "Seleção de Espaço" do nível de acesso Equipe. Ver TaskSpaceMember no
// schema e lib/auth.ts:getAccessibleTaskSpaceIds.
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const memberships = await prisma.taskSpaceMember.findMany({
    where: { userId: params.userId, taskSpace: { workspaceId: auth.workspaceId } },
    select: { taskSpaceId: true },
  })
  return NextResponse.json({ spaceIds: memberships.map(m => m.taskSpaceId) })
}

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { spaceIds } = await req.json()
  if (!Array.isArray(spaceIds)) return NextResponse.json({ error: 'spaceIds deve ser um array' }, { status: 400 })

  const validSpaces = await prisma.taskSpace.findMany({
    where: { workspaceId: auth.workspaceId, id: { in: spaceIds } },
    select: { id: true },
  })
  const validIds = validSpaces.map(s => s.id)

  await prisma.$transaction([
    prisma.taskSpaceMember.deleteMany({ where: { userId: params.userId, taskSpace: { workspaceId: auth.workspaceId } } }),
    ...validIds.map(taskSpaceId =>
      prisma.taskSpaceMember.create({ data: { userId: params.userId, taskSpaceId } })
    ),
  ])

  return NextResponse.json({ ok: true })
}
