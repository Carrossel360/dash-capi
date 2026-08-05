import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { verifyPasswordResetToken } from '@/lib/password-reset'

// Mesmo esquema de hash usado em login/criação de usuário (app/api/auth/login/route.ts,
// app/api/workspace/members/[userId]/route.ts etc) — SHA-256 simples, não bcrypt.
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}))
  if (!token || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Token e senha são obrigatórios' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 8 caracteres' }, { status: 400 })
  }

  const userId = await verifyPasswordResetToken(token)
  if (!userId) {
    return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 400 })
  }

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } })

  return NextResponse.json({ ok: true })
}
