import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Rota pública (sem auth) — o link curto colado em bio/site/anúncio aponta pra cá. Incrementa
// o contador de clique e redireciona pro wa.me real, igual o link direto que a agência já
// gerava antes — só que agora dá pra medir quantos cliques cada link recebeu. O número do
// WhatsApp é lido do workspace NA HORA do clique (não congelado na criação do link), então
// se o cliente trocar o número, os links antigos continuam funcionando com o número novo.
//
// `?via=button|form` é opcional — quem cola o link no site pode marcar de qual ponto de
// contato veio o clique (botão de WhatsApp vs redirect pós-formulário), pra quebrar o
// contador total na aba Rastreio. Links usados fora do site (bio, anúncio) não mandam esse
// parâmetro e só contam pro total, sem quebra.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const link = await prisma.trackingLink.findUnique({ where: { slug: params.slug } })
  if (!link) return NextResponse.redirect(new URL('/', req.url))

  const via = req.nextUrl.searchParams.get('via')
  const [, workspace] = await Promise.all([
    prisma.trackingLink.update({
      where: { id: link.id },
      data: {
        clickCount: { increment: 1 },
        ...(via === 'button' ? { clickCountButton: { increment: 1 } } : {}),
        ...(via === 'form' ? { clickCountForm: { increment: 1 } } : {}),
      },
    }),
    prisma.workspace.findUnique({ where: { id: link.workspaceId }, select: { whatsappNumber: true } }),
  ])

  const number = workspace?.whatsappNumber?.replace(/\D/g, '')
  if (!number) return NextResponse.redirect(new URL('/', req.url))

  const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(link.phrase)}`
  return NextResponse.redirect(waUrl)
}
