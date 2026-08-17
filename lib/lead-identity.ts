import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export function normalizeLeadEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export function normalizeLeadPhone(value: string | null | undefined, currency: string): string | null {
  let digits = value?.replace(/\D/g, '') ?? ''
  if (currency === 'USD' && digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (currency === 'BRL' && (digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  return digits.length >= 7 ? digits : null
}

export async function getLeadIdentity(workspaceId: string, phone?: string | null, email?: string | null) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { currency: true } })
  return {
    normalizedPhone: normalizeLeadPhone(phone, workspace?.currency ?? 'BRL'),
    normalizedEmail: normalizeLeadEmail(email),
  }
}

export async function findDuplicateLead(
  workspaceId: string,
  phone?: string | null,
  email?: string | null,
  excludeId?: string,
) {
  const identity = await getLeadIdentity(workspaceId, phone, email)
  if (!identity.normalizedPhone && !identity.normalizedEmail) return null

  const indexed = await prisma.lead.findFirst({
    where: {
      workspaceId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        identity.normalizedPhone ? { normalizedPhone: identity.normalizedPhone } : undefined,
        identity.normalizedEmail ? { normalizedEmail: identity.normalizedEmail } : undefined,
      ].filter(Boolean) as Prisma.LeadWhereInput[],
    },
    orderBy: [{ dealValue: 'desc' }, { createdAt: 'asc' }],
  })
  if (indexed) return indexed

  // Leads antigos ainda não têm os campos normalizados preenchidos. Compara em memória para
  // impedir que uma nova entrada duplique esse histórico antes da limpeza/backfill completo.
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { currency: true } })
  const legacy = await prisma.lead.findMany({
    where: { workspaceId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: [{ dealValue: 'desc' }, { createdAt: 'asc' }],
  })
  return legacy.find(lead =>
    (identity.normalizedPhone && normalizeLeadPhone(lead.phone, workspace?.currency ?? 'BRL') === identity.normalizedPhone)
    || (identity.normalizedEmail && normalizeLeadEmail(lead.email) === identity.normalizedEmail)
  ) ?? null
}

export function isLeadIdentityConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
