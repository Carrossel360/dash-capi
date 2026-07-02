import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma as db } from '@/lib/db'
import crypto from 'crypto'

function hashPassword(p: string) {
  return crypto.createHash('sha256').update(p).digest('hex')
}

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await db.workspaceMember.findMany({
    where: { workspaceId: auth.workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: 'asc' } },
  })

  return NextResponse.json({
    members: members.map(m => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  })
}

// Adiciona um membro à agência e replica o acesso em todos os clientes existentes.
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email e password são obrigatórios' }, { status: 400 })
  }

  const validRoles = ['admin', 'manager', 'attendant', 'viewer']
  const memberRole = validRoles.includes(role) ? role : 'viewer'

  const existing = await db.workspaceMember.findFirst({
    where: { workspaceId: auth.workspaceId, user: { email } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Este e-mail já tem acesso a este workspace' }, { status: 409 })
  }

  const user = await db.user.upsert({
    where: { email },
    update: { name, passwordHash: hashPassword(password) },
    create: { email, name, passwordHash: hashPassword(password) },
  })

  const member = await db.workspaceMember.create({
    data: { workspaceId: auth.workspaceId, userId: user.id, role: memberRole },
  })

  const clientWorkspaces = await db.workspace.findMany({ where: { isAgency: false }, select: { id: true } })
  for (const ws of clientWorkspaces) {
    await db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
      update: { role: memberRole },
      create: { workspaceId: ws.id, userId: user.id, role: memberRole },
    })
  }

  return NextResponse.json({
    memberId: member.id,
    userId: user.id,
    role: member.role,
    name: user.name,
    email: user.email,
    clientsGranted: clientWorkspaces.length,
  }, { status: 201 })
}
