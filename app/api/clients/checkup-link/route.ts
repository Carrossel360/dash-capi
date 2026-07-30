import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { signServicesCheckupToken } from '@/lib/services-checkup'

// Gera o link público (sem login) do checkup de serviços — um "quiz" que passa por todos os
// clientes com checkboxes de serviço, pra mandar pra quem souber quais serviços cada cliente
// tem contratado, sem precisar preencher um por um manualmente aqui no painel.
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { isAgency: true } })
  if (!ws?.isAgency || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const token = await signServicesCheckupToken()
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || req.nextUrl.origin
  return NextResponse.json({ url: `${baseUrl}/checkup-servicos/${token}` })
}
