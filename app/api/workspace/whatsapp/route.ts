import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchUazapiConnectionState } from '@/lib/uazapi'

// PATCH — save UazAPI credentials (admin only)
export async function PATCH(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { uazapiUrl, uazapiAdminToken, uazapiInstanceName, uazapiToken, whatsappNumber } = await req.json()

  await prisma.workspace.update({
    where: { id: auth.workspaceId },
    data: {
      ...(uazapiUrl           !== undefined && { uazapiUrl }),
      ...(uazapiAdminToken    !== undefined && { uazapiAdminToken }),
      ...(uazapiInstanceName  !== undefined && { uazapiInstanceName }),
      ...(uazapiToken         !== undefined && { uazapiToken }),
      ...(whatsappNumber      !== undefined && { whatsappNumber }),
    },
  })

  return NextResponse.json({ ok: true })
}

// GET — fetch QR code / connection status from UazAPI
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({
    where:  { id: auth.workspaceId },
    select: { uazapiUrl: true, uazapiToken: true, uazapiInstanceName: true },
  })

  if (!ws?.uazapiUrl || !ws?.uazapiInstanceName) {
    return NextResponse.json({ error: 'WhatsApp ainda não configurado pelo administrador' }, { status: 400 })
  }

  // Also fetch agency admin token for operations that need it
  const agency = await prisma.workspace.findFirst({
    where:  { isAgency: true },
    select: { uazapiAdminToken: true },
  })

  const instanceToken = ws.uazapiToken ?? ws.uazapiInstanceName
  const adminToken    = agency?.uazapiAdminToken ?? ''

  try {
    const result = await fetchUazapiConnectionState(ws.uazapiUrl, instanceToken, adminToken)
    if (result.kind === 'connected') {
      return NextResponse.json({
        status: 'connected',
        ...(result.state !== undefined && { state: result.state }),
        ...(result.instance !== undefined && { instance: result.instance }),
      })
    }
    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: 502 })
    }
    return NextResponse.json(result.data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Não foi possível conectar à UazAPI' }, { status: 502 })
  }
}

// POST — create a new UazAPI instance using admin token
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: auth.userId } },
  })
  if (!member || !['admin', 'manager'].includes(member.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const ws = await prisma.workspace.findUnique({
    where:  { id: auth.workspaceId },
    select: { uazapiUrl: true, uazapiAdminToken: true, uazapiInstanceName: true },
  })

  if (!ws?.uazapiUrl || !ws?.uazapiAdminToken) {
    return NextResponse.json({ error: 'Configure a URL e o Admin Token da UazAPI primeiro' }, { status: 400 })
  }

  const instanceName = ws.uazapiInstanceName || auth.workspaceId.slice(0, 16)

  try {
    const res = await fetch(`${ws.uazapiUrl}/instance/create`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'admin-token':   ws.uazapiAdminToken,
        token:           ws.uazapiAdminToken,
      },
      body: JSON.stringify({ name: instanceName }),
    })
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.message ?? data.error ?? 'Erro ao criar instância' }, { status: 502 })
    }

    // Save the instance token returned by UazAPI
    const instanceToken = data.token ?? data.uuid ?? data.key ?? data.Token ?? null
    if (instanceToken) {
      await prisma.workspace.update({
        where: { id: auth.workspaceId },
        data:  { uazapiToken: instanceToken, uazapiInstanceName: instanceName },
      })
    }

    return NextResponse.json({ ok: true, instanceToken, instanceName, raw: data })
  } catch {
    return NextResponse.json({ error: 'Não foi possível conectar à UazAPI' }, { status: 502 })
  }
}
