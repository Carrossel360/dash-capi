import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { enqueueCapiEvent } from '@/lib/capi-events'
import { buildHashedUserData } from '@/lib/utils'
import { findDuplicateLead, getLeadIdentity, isLeadIdentityConflict } from '@/lib/lead-identity'

// Recebe o POST da ação "Webhook" de um formulário Elementor Pro. O formato exato do body
// varia por versão/config do Elementor (plano/aninhado, chaves por id de campo), então o
// parser abaixo é tolerante: aceita tanto {fields: {id: {value}}} quanto um objeto plano
// {campo: valor}, e identifica nome/e-mail/telefone por nome de campo comum OU por `type`
// quando disponível. Nada é perdido mesmo se a detecção falhar — o payload inteiro vai pro
// metadata do lead.
const NAME_KEYS = ['name', 'nome', 'full_name', 'seu_nome', 'first_name']
const EMAIL_KEYS = ['email', 'e-mail', 'seu_email']
const PHONE_KEYS = ['phone', 'telefone', 'celular', 'whatsapp', 'tel', 'seu_telefone']

function nonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pageUrlFromFields(fields: Record<string, { value: string }>): string | null {
  for (const [key, field] of Object.entries(fields)) {
    const normalized = normalizeKey(key)
    if (['url da pagina', 'page url', 'pagina url', 'url'].includes(normalized) && field.value.trim()) {
      return field.value.trim()
    }
  }
  return null
}

function queryParam(pageUrl: string | null, key: string): string | null {
  if (!pageUrl) return null
  try {
    return nonEmpty(new URL(pageUrl).searchParams.get(key))
  } catch {
    return null
  }
}

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

// CORS liberado: além do POST server-to-server do Elementor Pro (que não manda Origin/preflight,
// então não é afetado por isso), sites estáticos sem WordPress (ex: Senamed, feito à parte) também
// postam aqui direto do navegador — mesmo padrão já usado em /api/collect.
function json(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init)
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = params

  let body: any
  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(await req.formData())
    } else {
      const raw = await req.text()
      try {
        body = JSON.parse(raw)
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw))
      }
    }
  } catch {
    return json({ ok: true })
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })
  if (!workspace) return json({ ok: true })

  const fields = normalizeFields(body)
  const name = pick(fields, NAME_KEYS, ['text']) || ''
  const email = pick(fields, EMAIL_KEYS, ['email'])
  const phoneRaw = pick(fields, PHONE_KEYS, ['tel'])
  const phone = phoneRaw ? `+${phoneRaw.replace(/\D/g, '')}` : null
  const pageUrl = pageUrlFromFields(fields)
  const utmSource = nonEmpty(body.utm_source, fields['utm_source']?.value, queryParam(pageUrl, 'utm_source'))
  const utmMedium = nonEmpty(body.utm_medium, fields['utm_medium']?.value, queryParam(pageUrl, 'utm_medium'))
  const utmCampaign = nonEmpty(body.utm_campaign, fields['utm_campaign']?.value, queryParam(pageUrl, 'utm_campaign'))
  const utmContent = nonEmpty(body.utm_content, fields['utm_content']?.value, queryParam(pageUrl, 'utm_content'))

  // Mesmo contato pode já existir por outro caminho (WhatsApp, formulário nativo, CRM antigo)
  // — sem essa checagem duplicaria quem já está em contato por outro canal.
  const crossSourceMatch = await findDuplicateLead(workspaceId, phone, email)
  if (crossSourceMatch) {
    const sourceMissing = !crossSourceMatch.source || crossSourceMatch.source === 'Indefinido'
    const attribution = {
      ...(sourceMissing && utmSource && { source: utmSource }),
      ...(!crossSourceMatch.utmSource && utmSource && { utmSource }),
      ...(!crossSourceMatch.utmMedium && utmMedium && { utmMedium }),
      ...(!crossSourceMatch.utmCampaign && utmCampaign && { utmCampaign }),
      ...(!crossSourceMatch.utmContent && utmContent && { utmContent }),
    }
    if (Object.keys(attribution).length) {
      await prisma.lead.update({ where: { id: crossSourceMatch.id }, data: attribution })
    }
    return json({ ok: true, leadId: crossSourceMatch.id, duplicate: true, attributionUpdated: Object.keys(attribution).length > 0 })
  }

  const firstStage = await prisma.pipelineStage.findFirst({
    where: { workspaceId },
    orderBy: { order: 'asc' },
    select: { id: true },
  })
  if (!firstStage) return json({ ok: true })

  const identity = await getLeadIdentity(workspaceId, phone, email)
  let newLead: { id: string }
  try {
    newLead = await prisma.lead.create({
      data: {
        workspaceId,
        name,
        email,
        phone,
        ...identity,
        // source só vira algo além de "Indefinido" se o formulário carregar um utm_source real.
        source: utmSource ?? 'Indefinido',
        utmSource,
        utmMedium: utmMedium ?? 'Formulário',
        utmCampaign,
        utmContent,
        metadata: { formName: body.form_name ?? null, raw: body },
        pipelineStageId: firstStage.id,
      },
      select: { id: true },
    })
  } catch (error) {
    if (isLeadIdentityConflict(error)) {
      const duplicate = await findDuplicateLead(workspaceId, phone, email)
      return json({ ok: true, leadId: duplicate?.id, duplicate: true })
    }
    throw error
  }

  await enqueueCapiEvent({
    workspaceId,
    leadId: newLead.id,
    eventName: 'Lead',
    source: 'webhook',
    userData: buildHashedUserData({ email: email ?? undefined, phone: phone ?? undefined }),
  })

  return json({ ok: true, leadId: newLead.id })
}
