export interface ParsedImportRow {
  name: string
  phone: string
  email: string
  source?: string
  status?: string
  clientType?: string
  receivedAt?: string
  utmMedium?: string
  notes?: string
  dealValue?: number
  importKey?: string
  metadata?: Record<string, string | null>
}

export function normalizeImportedPhone(raw: string, currency: string): string | null {
  const withoutExtension = raw.replace(/\s*(?:ext(?:ension)?\.?|x)\s*\d+\s*$/i, '')
  let digits = withoutExtension.replace(/\D/g, '')
  if (digits.length < 7) return null

  if (currency === 'USD' && digits.length === 10) digits = `1${digits}`
  if (currency === 'BRL' && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`
  return `+${digits}`
}

export function parseImportedDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined
  const monthAliases: Record<string, string> = {
    'jan.': 'Jan', 'fev.': 'Feb', 'mar.': 'Mar', 'abr.': 'Apr', 'mai.': 'May', 'jun.': 'Jun',
    'jul.': 'Jul', 'ago.': 'Aug', 'set.': 'Sep', 'out.': 'Oct', 'nov.': 'Nov', 'dez.': 'Dec',
  }
  const normalized = Object.entries(monthAliases).reduce(
    (dateValue, [from, to]) => dateValue.replace(new RegExp(`^${from.replace('.', '\\.')}\\s`, 'i'), `${to} `),
    value.trim(),
  )
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = new Map<string, number>([['\t', 0], [';', 0], [',', 0]])
  let quoted = false
  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i]
    if (char === '"') {
      if (quoted && firstLine[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ','
}

function parseDelimitedText(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const pushCell = () => {
    row.push(cell.trim())
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (row.some(value => value !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      pushCell()
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else {
      cell += char
    }
  }
  if (cell || row.length) pushRow()
  return rows
}

const HEADER_ALIASES = {
  name: ['nome', 'name', 'full name', 'customer name'],
  phone: ['telefone', 'phone', 'phone number', 'celular', 'whatsapp'],
  email: ['email', 'e mail'],
  source: ['origem', 'source', 'origin', 'lead source'],
  status: ['status', 'estagio', 'stage', 'pipeline status', 'crm status'],
  clientType: ['tipo de cliente', 'client type', 'customer type'],
  receivedAt: ['data do lead', 'lead received', 'received at', 'created at', 'data'],
  notes: ['observacoes', 'observacao', 'notes', 'note'],
} as const

function parseMoney(value: string): number | undefined {
  const normalized = value.trim().replace(/[^\d,.-]/g, '').replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  return headers.findIndex(header => aliases.includes(header))
}

function valueAt(row: string[], index: number): string {
  return index >= 0 ? row[index] ?? '' : ''
}

function looksLikePhone(value: string): boolean {
  return value.replace(/\D/g, '').length >= 7
}

function importKeyPart(value: string): string {
  return normalizeLabel(value).replace(/\|/g, '/')
}

export function parseImportText(text: string): ParsedImportRow[] {
  const table = parseDelimitedText(text.replace(/^\uFEFF/, ''))
  if (table.length === 0) return []

  const headers = table[0].map(normalizeLabel)
  const isAdaptedGoogleLocalServices = ['nome', 'telefone', 'tipo de servicos', 'lead type', 'lead received', 'origem']
    .every(header => headers.includes(header))
  const isGoogleLocalServices = ['customer', 'job type', 'lead type', 'lead received']
    .every(header => headers.includes(header))
  const knownHeaders: string[] = Object.values(HEADER_ALIASES).flat()
  const hasHeader = isGoogleLocalServices || headers.some(header => knownHeaders.includes(header))
  const dataRows = hasHeader ? table.slice(1) : table

  if (isAdaptedGoogleLocalServices) {
    const nameIdx = headers.indexOf('nome')
    const phoneIdx = headers.indexOf('telefone')
    const serviceTypeIdx = headers.indexOf('tipo de servicos')
    const locationIdx = headers.indexOf('location')
    const leadTypeIdx = headers.indexOf('lead type')
    const chargeStatusIdx = headers.indexOf('charge status')
    const receivedAtIdx = headers.indexOf('lead received')
    const statusIdx = findColumn(headers, HEADER_ALIASES.status)
    const sourceIdx = findColumn(headers, HEADER_ALIASES.source)
    const notesIdx = findColumn(headers, HEADER_ALIASES.notes)
    const dealValueIdx = headers.findIndex(header => header.startsWith('venda'))

    return dataRows.map(row => {
      const name = valueAt(row, nameIdx) || 'Sem nome'
      const rawPhone = valueAt(row, phoneIdx)
      const phone = looksLikePhone(rawPhone) ? rawPhone : ''
      const serviceType = valueAt(row, serviceTypeIdx)
      const location = valueAt(row, locationIdx)
      const leadType = valueAt(row, leadTypeIdx)
      const chargeStatus = valueAt(row, chargeStatusIdx)
      const receivedAt = valueAt(row, receivedAtIdx)
      const importKey = [phone || name, serviceType, location, leadType, receivedAt]
        .map(importKeyPart)
        .join('|')

      return {
        name,
        phone,
        email: '',
        source: valueAt(row, sourceIdx) || 'GLS',
        status: valueAt(row, statusIdx) || undefined,
        receivedAt: receivedAt || undefined,
        utmMedium: 'Google Local Services',
        notes: valueAt(row, notesIdx) || undefined,
        dealValue: parseMoney(valueAt(row, dealValueIdx)),
        importKey: `google-local-services:${importKey}`,
        metadata: {
          phoneOriginal: phone || null,
          serviceType: serviceType || null,
          location: location || null,
          leadType: leadType || null,
          chargeStatus: chargeStatus || null,
          leadReceived: receivedAt || null,
        },
      }
    })
  }

  if (isGoogleLocalServices) {
    const customerIdx = headers.indexOf('customer')
    const jobTypeIdx = headers.indexOf('job type')
    const searchIntentIdx = headers.indexOf('search intent')
    const locationIdx = headers.indexOf('location')
    const leadTypeIdx = headers.indexOf('lead type')
    const chargeStatusIdx = headers.indexOf('charge status')
    const receivedAtIdx = headers.indexOf('lead received')
    const lastActivityIdx = headers.indexOf('last activity')
    const statusIdx = findColumn(headers, HEADER_ALIASES.status)
    const clientTypeIdx = findColumn(headers, HEADER_ALIASES.clientType)

    return dataRows.map(row => {
      const customer = valueAt(row, customerIdx)
      const jobType = valueAt(row, jobTypeIdx)
      const searchIntent = valueAt(row, searchIntentIdx)
      const location = valueAt(row, locationIdx)
      const leadType = valueAt(row, leadTypeIdx)
      const chargeStatus = valueAt(row, chargeStatusIdx)
      const receivedAt = valueAt(row, receivedAtIdx)
      const lastActivity = valueAt(row, lastActivityIdx)
      const phone = looksLikePhone(customer) ? customer : ''
      const name = phone ? 'Sem nome' : customer || 'Sem nome'
      const importKey = [customer, jobType, location, leadType, receivedAt, lastActivity]
        .map(importKeyPart)
        .join('|')
      const notes = [
        leadType && `Tipo: ${leadType}`,
        jobType && `Serviço: ${jobType}`,
        location && `Local: ${location}`,
        chargeStatus && `Cobrança Google: ${chargeStatus}`,
      ].filter(Boolean).join(' | ')

      return {
        name,
        phone,
        email: '',
        source: 'Google Local Services',
        status: valueAt(row, statusIdx) || undefined,
        clientType: valueAt(row, clientTypeIdx) || undefined,
        receivedAt: receivedAt || undefined,
        utmMedium: leadType || 'Local Services',
        notes: notes || undefined,
        importKey: `google-local-services:${importKey}`,
        metadata: {
          customer: customer || null,
          jobType: jobType || null,
          searchIntent: searchIntent || null,
          location: location || null,
          leadType: leadType || null,
          chargeStatus: chargeStatus || null,
          leadReceived: receivedAt || null,
          lastActivity: lastActivity || null,
        },
      }
    })
  }

  const nameIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.name) : 0
  const phoneIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.phone) : 1
  const emailIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.email) : 2
  const sourceIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.source) : -1
  const statusIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.status) : -1
  const clientTypeIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.clientType) : -1
  const receivedAtIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.receivedAt) : -1
  const notesIdx = hasHeader ? findColumn(headers, HEADER_ALIASES.notes) : -1

  return dataRows.map(row => ({
    name: valueAt(row, nameIdx),
    phone: valueAt(row, phoneIdx),
    email: valueAt(row, emailIdx),
    source: valueAt(row, sourceIdx) || undefined,
    status: valueAt(row, statusIdx) || undefined,
    clientType: valueAt(row, clientTypeIdx) || undefined,
    receivedAt: valueAt(row, receivedAtIdx) || undefined,
    notes: valueAt(row, notesIdx) || undefined,
  })).filter(row => row.phone || row.email)
}
