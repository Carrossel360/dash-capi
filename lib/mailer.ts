import nodemailer from 'nodemailer'

// SMTP genérico via env vars — pensado pro e-mail que a agência já tem na Hostinger (mesmo
// domínio do app), mas funciona com qualquer provedor SMTP padrão. Sem credencial real
// configurada, sendMail lança e o chamador decide como reagir (ver forgot-password/route.ts:
// nunca revela ao usuário se o envio falhou, pra não vazar se o e-mail existe ou não).
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (transporter) return transporter
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS ausentes)')
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return transporter
}

export async function sendMail(input: { to: string; subject: string; html: string }): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  await getTransporter().sendMail({ from, to: input.to, subject: input.subject, html: input.html })
}
