import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { enqueueCapiEvent } from '@/lib/capi-events'
import { buildHashedUserData } from '@/lib/utils'

// Recebe o POST da ação "Webhook" de um formulário Elementor Pro. O formato exato do body
// varia por versão/config do Elementor (plano/aninhado, chaves por id de campo), então o
// parser abaixo é tolerante: aceita tanto {fields: {id: {value}}} quanto um objeto plano
// {campo: valor}, e identifica nome/e-mail/telefone por nome de campo comum OU por `type`
// quando disponível. Nada é perdido mesmo se a detecção falhar — o payload inteiro vai pro
// metadata do lead.
const NAME_KEYS = ['name', 'nome', 'full_name', 'seu_nome', 'first_name']
const EMAIL_KEYS = ['email', 'e-mail', 'seu_email']
const PHONE_KEYS = ['phone', 'telefone', 'celular', 'whatsapp', 'tel', 'seu_telefone']

function normalizeFields(body: any): Record<string, { value: string; type?: string }> {
  const out: Record<string, { value: string; type?: string }> = {}
  const raw = body?.fields && typeof body.fields === 'object' ? body.fields : body
  if (!raw || typeof raw !== 'object') return out
  for (const [key, v] of Object.entries(raw)) {
    if (v == null) continue
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const value = obj.value ?? obj.raw_value ?? ''
      out[key] = { value: String(value), type: obj.type ? String(obj.type) : undefined }
      // título legível do campo (ex: "Nome", "E-mail") também entra como chave alternativa
      if (typeof obj.title === 'string') out[obj.title.toLowerCase()] = out[key]
    } else if (typeof v === 'string' || typeof v === 'number') {
      out[key] = { value: String(v) }
    }
  }
  return out
}

function pick(fields: Record<string, { value: string; type?: string }>, keys: string[], types: string[]): string | null {
  for (const [key, f] of Object.entries(fields)) {
    if (types.length && f.type && types.includes(f.type)) return f.value
  }
  for (const k of keys) {
    const f = fields[k.toLowerCase()]
    if (f?.value) return f.value
  }
  for (const [key, f] of Object.entries(fields)) {
    if (keys.some(k => key.toLowerCase().includes(k))) return f.value
  }
  return null
}

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = params

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })
  if (!workspace) return NextResponse.json({ ok: true })

  const fields = normalizeFields(body)
  const name = pick(fields, NAME_KEYS, ['text']) || 'Lead (site)'
  const email = pick(fields, EMAIL_KEYS, ['email'])
  const phoneRaw = pick(fields, PHONE_KEYS, ['tel'])
  const phone = phoneRaw ? `+${phoneRaw.replace(/\D/g, '')}` : null

  // Mesmo contato pode já existir por outro caminho (WhatsApp, formulário nativo, CRM antigo)
  // — sem essa checagem duplicaria quem já está em contato por outro canal.
  const crossSourceMatch = await prisma.lead.findFirst({
    where: {
      workspaceId,
      OR: [
        phone ? { phone } : undefined,
        email ? { email } : undefined,
      ].filter(Boolean) as Prisma.LeadWhereInput[],
    },
    select: { id: true },
  })
  if (crossSourceMatch) return NextResponse.json({ ok: true, leadId: crossSourceMatch.id, duplicate: true })

  const firstStage = await prisma.pipelineStage.findFirst({
    where: { workspaceId },
    orderBy: { order: 'asc' },
    select: { id: true },
  })
  if (!firstStage) return NextResponse.json({ ok: true })

  const newLead = await prisma.lead.create({
    data: {
      workspaceId,
      name,
      email,
      phone,
      // source só vira algo além de "Indefinido" se o formulário carregar um utm_source real
      // (ex: campo oculto lendo o parâmetro da URL) — o canal (Site) é sempre conhecido.
      source: body.utm_source ?? fields['utm_source']?.value ?? 'Indefinido',
      utmSource: body.utm_source ?? fields['utm_source']?.value ?? null,
      utmMedium: body.utm_medium ?? fields['utm_medium']?.value ?? 'Site',
      utmCampaign: body.utm_campaign ?? fields['utm_campaign']?.value ?? null,
      metadata: { formName: body.form_name ?? null, raw: body },
      pipelineStageId: firstStage.id,
    },
  })

  await enqueueCapiEvent({
    workspaceId,
    leadId: newLead.id,
    eventName: 'Lead',
    source: 'webhook',
    userData: buildHashedUserData({ email: email ?? undefined, phone: phone ?? undefined }),
  })

  return NextResponse.json({ ok: true, leadId: newLead.id })
}
