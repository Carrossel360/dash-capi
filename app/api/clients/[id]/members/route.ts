import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

function hashPassword(p: string) {
  return crypto.createHash('sha256').update(p).digest('hex')
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: 'asc' } },
  })

  return NextResponse.json({
    members: members.map(m => ({
      memberId: m.id,
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email e password são obrigatórios' }, { status: 400 })
  }

  const validRoles = ['admin', 'manager', 'attendant', 'viewer']
  const memberRole = validRoles.includes(role) ? role : 'viewer'

  const existing = await prisma.workspaceMember.findFirst({
    where: { workspaceId: params.id, user: { email } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Este e-mail já tem acesso a este workspace' }, { status: 409 })
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash: hashPassword(password) },
    create: { email, name, passwordHash: hashPassword(password) },
  })

  const member = await prisma.workspaceMember.create({
    data: { workspaceId: params.id, userId: user.id, role: memberRole },
  })

  return NextResponse.json({
    memberId: member.id,
    userId: user.id,
    role: member.role,
    name: user.name,
    email: user.email,
  }, { status: 201 })
}
