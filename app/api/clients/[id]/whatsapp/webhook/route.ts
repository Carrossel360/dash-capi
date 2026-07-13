import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Eventos/exclusões que já observamos numa instância em produção (Mulher Brasileira) —
// mantém o mesmo formato pra não surpreender quem já está acostumado com esse comportamento.
const WEBHOOK_EVENTS = ['messages']
const EXCLUDE_MESSAGES = ['wasSentByApi', 'isGroupYes']

function ourWebhookUrl(workspaceId: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/webhooks/uazapi/${workspaceId}`
}

async function requireLinkedWorkspace(req: NextRequest, clientId: string) {
  const auth = await getAuthPayload(req)
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: clientId, userId: auth.userId } },
  })
  if (!membership || !['admin', 'manager'].includes(membership.role)) {
    return { error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: clientId },
    select: { id: true, uazapiUrl: true, uazapiToken: true, uazapiInstanceName: true },
  })
  if (!workspace?.uazapiUrl || !workspace?.uazapiToken) {
    return { error: NextResponse.json({ error: 'Nenhuma instância vinculada a este cliente ainda' }, { status: 400 }) }
  }
  return { workspace }
}

// GET — mostra pra onde o webhook da instância está apontando hoje (sem alterar nada)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireLinkedWorkspace(req, params.id)
  if ('error' in result) return result.error
  const { workspace } = result

  try {
    const res = await fetch(`${workspace.uazapiUrl}/webhook`, {
      headers: { token: workspace.uazapiToken! },
    })
    if (!res.ok) throw new Error(`UazAPI retornou ${res.status}`)
    const data = await res.json()
    const current = Array.isArray(data) ? data[0] : data
    const expected = ourWebhookUrl(workspace.id)

    return NextResponse.json({
      configured: !!current?.url,
      currentUrl: current?.url ?? null,
      enabled: current?.enabled ?? null,
      isPointingHere: current?.url === expected,
      expectedUrl: expected,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao consultar webhook' }, { status: 502 })
  }
}

// POST — troca o webhook da instância pra apontar pra este sistema. Ação explícita e manual:
// nunca disparada automaticamente (ex: ao vincular a instância) — quem decide o momento é
// quem administra o cliente, já que isso redireciona o tráfego que hoje for pra outro destino.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireLinkedWorkspace(req, params.id)
  if ('error' in result) return result.error
  const { workspace } = result

  try {
    const res = await fetch(`${workspace.uazapiUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: workspace.uazapiToken! },
      body: JSON.stringify({
        url: ourWebhookUrl(workspace.id),
        enabled: true,
        events: WEBHOOK_EVENTS,
        excludeMessages: EXCLUDE_MESSAGES,
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.message ?? data?.error ?? `UazAPI retornou ${res.status}`)

    return NextResponse.json({ ok: true, url: ourWebhookUrl(workspace.id) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao ativar webhook' }, { status: 502 })
  }
}
