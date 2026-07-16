import { prisma } from '@/lib/db'
import { generateEventId } from '@/lib/utils'
import type { EventSource, Prisma } from '@prisma/client'

// Traduz o gatilho configurado no estágio do pipeline pro event_name real mandado à Meta.
// 'qualified_lead' não é um Standard Event da Meta — vai como Custom Event mesmo (mesmo
// tratamento que 'WhatsAppClick' já recebe no tracker do site), só enriquece o pixel/otimização,
// não participa da atribuição de campanha (quem faz isso é o ctwa_clid em user_data).
export function stageEventName(trigger: string): string | null {
  if (trigger === 'purchase') return 'Purchase'
  if (trigger === 'qualified_lead') return 'QualifiedLead'
  if (trigger === 'lead') return 'Lead'
  return null
}

interface EnqueueOptions {
  workspaceId: string
  leadId: string
  eventName: string
  source: EventSource
  userData: Prisma.InputJsonValue
  customData?: Prisma.InputJsonValue
  // Purchase pode legitimamente se repetir pro mesmo lead (cliente recorrente) — os demais
  // eventos (Lead, QualifiedLead) só fazem sentido uma vez por lead, então por padrão não
  // duplica se já existir um evento igual em queued/sent (evita reenviar ao mover o card
  // de volta pro mesmo estágio, ou por engano pra outro estágio com o mesmo gatilho).
  dedupe?: boolean
}

export async function enqueueCapiEvent({
  workspaceId, leadId, eventName, source, userData, customData, dedupe = true,
}: EnqueueOptions) {
  if (dedupe) {
    const existing = await prisma.cAPIEvent.findFirst({
      where: { leadId, eventName, status: { in: ['queued', 'sent'] } },
      select: { id: true },
    })
    if (existing) return null
  }

  return prisma.cAPIEvent.create({
    data: {
      workspaceId,
      leadId,
      eventName,
      eventTime: new Date(),
      eventId: generateEventId(),
      source,
      status: 'queued',
      userData,
      customData,
    },
  })
}
