import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    token:          instanceToken,
    AdminToken:     adminToken,
  }

  try {
    // First try to get connection status
    const statusRes = await fetch(`${ws.uazapiUrl}/instance/connectionState`, {
      headers,
    }).catch(() => null)

    if (statusRes?.ok) {
      const statusData = await statusRes.json()
      const state = statusData?.state ?? statusData?.status ?? statusData?.connectionStatus ?? ''
      if (state === 'open' || state === 'connected') {
        return NextResponse.json({ status: 'connected', state })
      }
    }

    // Get QR code / connection status
    const qrRes = await fetch(`${ws.uazapiUrl}/instance/connect`, {
      method:  'POST',
      headers,
    })
    const data = await qrRes.json()

    if (!qrRes.ok) {
      return NextResponse.json({ error: `UazAPI: ${data?.error ?? data?.message ?? qrRes.status}` }, { status: 502 })
    }

    // Normalize response: check if connected
    if (data.connected || data.loggedIn || data.instance?.status === 'connected') {
      return NextResponse.json({ status: 'connected', instance: data.instance })
    }

    return NextResponse.json(data)
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
