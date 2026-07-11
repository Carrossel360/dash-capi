import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { buildWorkspaceServices } from '@/lib/utils'
import crypto from 'crypto'

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Sem workspace associado' }, { status: 403 })
    }

    const token = await signToken({
      userId: user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    })

    const ws = membership.workspace
    return NextResponse.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      workspace: {
        id: ws.id, name: ws.name, slug: ws.slug,
        segment: ws.segment, isAgency: ws.isAgency,
        role: membership.role,
        currency: ws.currency,
        services: buildWorkspaceServices(ws),
        funnelMetrics: ws.funnelMetrics,
        googleFunnelMetrics: ws.googleFunnelMetrics,
        metaVisibleMetrics: ws.metaVisibleMetrics,
        googleVisibleMetrics: ws.googleVisibleMetrics,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
