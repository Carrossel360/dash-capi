import axios from 'axios'

// Lead Ads (formulário instantâneo/nativo) — diferente de lib/meta-ads.ts (insights/relatório)
// e lib/meta-capi.ts (envio de eventos de conversão). Busca por polling (mesmo padrão do fluxo
// n8n que a agência já usava e validou: sem webhook, sem depender de inscrição de Página —
// só lista os formulários ativos da Página e puxa os leads de cada um, com o token de agência
// que já tem permissão leads_retrieval).

export interface MetaLeadgenForm {
  id: string
  name: string
  status: string
}

export interface MetaLeadField {
  name: string
  values: string[]
}

export interface MetaLead {
  id: string
  createdTime: string | null
  formId: string | null
  adId: string | null
  adName: string | null
  adsetId: string | null
  adsetName: string | null
  campaignId: string | null
  campaignName: string | null
  isOrganic: boolean
  platform: string | null
  fieldData: MetaLeadField[]
}

// leadgen_forms/leads exigem um Page Access Token — o token de agência (System User, usado
// pros insights de gasto/cliques em lib/meta-ads.ts) não serve direto pra esses dois edges
// (erro #190 "This method must be called with a Page Access Token"), mesmo já tendo acesso à
// Página. Troca simples: se o System User é admin/parceiro da Página, a própria Graph API
// devolve o token específico dela a partir do token de agência.
export async function fetchPageAccessToken(pageId: string, agencyAccessToken: string): Promise<string> {
  const { data } = await axios.get(`https://graph.facebook.com/v21.0/${pageId}`, {
    params: { fields: 'access_token', access_token: agencyAccessToken },
  })
  return data.access_token
}

export async function fetchActiveLeadgenForms(pageId: string, accessToken: string): Promise<MetaLeadgenForm[]> {
  const { data } = await axios.get(`https://graph.facebook.com/v21.0/${pageId}/leadgen_forms`, {
    params: { access_token: accessToken, fields: 'id,name,status', limit: 100 },
  })
  return ((data.data ?? []) as MetaLeadgenForm[]).filter(f => f.status === 'ACTIVE')
}

export async function fetchFormLeads(formId: string, accessToken: string): Promise<MetaLead[]> {
  const results: MetaLead[] = []
  let url: string | undefined = `https://graph.facebook.com/v21.0/${formId}/leads`
  let params: Record<string, unknown> | undefined = {
    access_token: accessToken,
    fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform',
    limit: 500,
  }

  while (url) {
    const { data }: { data: { data?: any[]; paging?: { next?: string } } } = await axios.get(url, { params })
    for (const r of data.data ?? []) {
      results.push({
        id: r.id,
        createdTime: r.created_time ?? null,
        formId: r.form_id ?? formId,
        adId: r.ad_id ?? null,
        adName: r.ad_name ?? null,
        adsetId: r.adset_id ?? null,
        adsetName: r.adset_name ?? null,
        campaignId: r.campaign_id ?? null,
        campaignName: r.campaign_name ?? null,
        isOrganic: !!r.is_organic,
        platform: r.platform ?? null,
        fieldData: r.field_data ?? [],
      })
    }
    url = data.paging?.next
    params = undefined
  }

  return results
}

export async function fetchAdAccountId(adId: string, accessToken: string): Promise<string | null> {
  const { data } = await axios.get(`https://graph.facebook.com/v21.0/${adId}`, {
    params: { access_token: accessToken, fields: 'account_id' },
  })
  return data.account_id ? String(data.account_id) : null
}

// Nomes de campo variam por formulário (idioma, campo custom) — cobre os mais comuns dos
// formulários nativos da Meta em pt-BR/en (full_name/phone_number são os nomes padrão que a
// própria Meta usa nos campos de autopreenchimento).
const NAME_FIELDS = ['full_name', 'first_name', 'nome', 'name']
const EMAIL_FIELDS = ['email', 'e-mail']
const PHONE_FIELDS = ['phone_number', 'phone', 'telefone', 'celular', 'whatsapp']

function findField(fields: MetaLeadField[], candidates: string[]): string | null {
  for (const c of candidates) {
    const f = fields.find(f => f.name.toLowerCase() === c)
    if (f?.values?.[0]) return f.values[0]
  }
  return null
}

export function extractLeadContact(fields: MetaLeadField[]): { name: string | null; email: string | null; phone: string | null } {
  return {
    name: findField(fields, NAME_FIELDS),
    email: findField(fields, EMAIL_FIELDS),
    phone: findField(fields, PHONE_FIELDS),
  }
}
