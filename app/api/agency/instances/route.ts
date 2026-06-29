import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET — list all UazAPI instances from the agency's server
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch agency workspace UazAPI config
  const agency = await prisma.workspace.findFirst({
    where: { isAgency: true },
    select: { uazapiUrl: true, uazapiAdminToken: true },
  })

  if (!agency?.uazapiUrl || !agency?.uazapiAdminToken) {
    return NextResponse.json({ error: 'Configure a URL e Admin Token da UazAPI nas configurações da agência primeiro' }, { status: 400 })
  }

  const headers: Record<string, string> = {
    AdminToken: agency.uazapiAdminToken,
    'Content-Type': 'application/json',
  }

  try {
    const res = await fetch(`${agency.uazapiUrl}/instance/all`, { headers })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({ instances: normalizeInstances(data) })
    }
    const errText = await res.text().catch(() => String(res.status))
    return NextResponse.json({ error: `UazAPI retornou ${res.status}: ${errText.slice(0, 200)}` }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao conectar à UazAPI' }, { status: 502 })
  }
}

function normalizeInstances(raw: unknown): { name: string; token: string; status: string }[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).instances ?? (raw as Record<string, unknown>).data ?? []
  if (!Array.isArray(arr)) return []
  return arr.map((i: Record<string, unknown>) => ({
    name:   String(i.name   ?? i.instanceName ?? i.key  ?? ''),
    token:  String(i.token  ?? i.uuid         ?? i.key  ?? i.Token ?? ''),
    status: String(i.status ?? i.state        ?? i.connectionStatus ?? 'unknown'),
  })).filter(i => i.name || i.token)
}
