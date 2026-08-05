import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { signPasswordResetToken } from '@/lib/password-reset'
import { sendMail } from '@/lib/mailer'

// Sempre responde com sucesso genérico, exista o e-mail ou não — evita que alguém descubra
// se um e-mail está cadastrado só testando esse endpoint (prática padrão de segurança).
const GENERIC_RESPONSE = { ok: true, message: 'Se esse e-mail estiver cadastrado, você vai receber um link de redefinição em instantes.' }

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'E-mail obrigatório' }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      const token = await signPasswordResetToken(user.id)
      const resetUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/redefinir-senha/${token}`
      await sendMail({
        to: user.email,
        subject: 'Redefinir senha — Sistema Orbital Carrossel 360',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #6a11cb;">Redefinir sua senha</h2>
            <p>Recebemos um pedido pra redefinir a senha da sua conta no Sistema Orbital. Se foi você, clique no botão abaixo — o link expira em 30 minutos.</p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}" style="background: #6a11cb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Redefinir senha</a>
            </p>
            <p style="color: #666; font-size: 12px;">Se você não pediu isso, pode ignorar este e-mail com segurança.</p>
          </div>
        `,
      })
    }
  } catch (err) {
    // Falha de envio (ex: SMTP ainda não configurado) não pode vazar pro cliente — logamos
    // pra investigar, mas a resposta pro usuário continua a mesma genérica de sempre.
    console.error('[POST /api/auth/forgot-password]', err)
  }

  return NextResponse.json(GENERIC_RESPONSE)
}
