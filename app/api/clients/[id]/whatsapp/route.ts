import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST — link existing instance OR create new one and link to client workspace
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { instanceName, instanceToken, createNew } = await req.json()

  // Get agency UazAPI config
  const agency = await prisma.workspace.findFirst({
    where: { isAgency: true },
    select: { uazapiUrl: true, uazapiAdminToken: true },
  })

  if (!agency?.uazapiUrl || !agency?.uazapiAdminToken) {
    return NextResponse.json({ error: 'Configure a UazAPI nas configurações da agência primeiro' }, { status: 400 })
  }

  if (createNew) {
    // Create new instance via UazAPI
    if (!instanceName) return NextResponse.json({ error: 'Nome da instância obrigatório' }, { status: 400 })

    try {
      const res = await fetch(`${agency.uazapiUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          AdminToken: agency.uazapiAdminToken,
        },
        body: JSON.stringify({ name: instanceName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Erro ao criar instância')

      const newToken = data.token ?? data.uuid ?? data.key ?? data.Token ?? null

      await prisma.workspace.update({
        where: { id: params.id },
        data: {
          uazapiUrl:          agency.uazapiUrl,
          uazapiToken:        newToken ?? instanceName,
          uazapiInstanceName: instanceName,
        },
      })

      return NextResponse.json({ ok: true, instanceName, instanceToken: newToken })
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao criar instância' }, { status: 502 })
    }
  }

  // Link existing instance
  await prisma.workspace.update({
    where: { id: params.id },
    data: {
      uazapiUrl:          agency.uazapiUrl,
      uazapiToken:        instanceToken ?? instanceName,
      uazapiInstanceName: instanceName,
    },
  })

  return NextResponse.json({ ok: true, instanceName })
}
