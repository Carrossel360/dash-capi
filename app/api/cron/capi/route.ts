import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendMetaCAPI } from '@/lib/meta-capi'
import { buildHashedUserData, calculateMatchQuality } from '@/lib/utils'

// Vercel chama este endpoint a cada 1 minuto (vercel.json)
// O header CRON_SECRET protege contra chamadas externas
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Busca até 50 eventos pendentes (ou que falharam e podem tentar de novo)
  const events = await prisma.cAPIEvent.findMany({
    where: {
      status: 'queued',
      attempts: { lt: 3 },
    },
    include: {
      workspace: {
        select: { metaPixelId: true, metaAccessToken: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  if (events.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let sent = 0
  let failed = 0

  for (const event of events) {
    const { workspace } = event
    if (!workspace.metaPixelId || !workspace.metaAccessToken) {
      await prisma.cAPIEvent.update({
        where: { id: event.id },
        data: { status: 'failed', attempts: { increment: 1 } },
      })
      failed++
      continue
    }

    const rawUserData = (event.userData as Record<string, string | null>) || {}
    const hashedUserData = buildHashedUserData(rawUserData)
    const customData = (event.customData as Record<string, unknown>) || undefined

    const isWhatsApp = event.source === 'whatsapp'
    const actionSource = event.source === 'site' ? 'website' : isWhatsApp ? 'business_messaging' : 'crm'
    const userData = isWhatsApp
      ? { ...hashedUserData, messaging_channel: 'whatsapp' }
      : hashedUserData

    try {
      const metaResponse = await sendMetaCAPI({
        pixelId: workspace.metaPixelId,
        accessToken: workspace.metaAccessToken,
        event: {
          event_name: event.eventName,
          event_time: Math.floor(event.eventTime.getTime() / 1000),
          event_id: event.eventId,
          action_source: actionSource,
          user_data: userData,
          custom_data: customData,
        },
      })

      await prisma.cAPIEvent.update({
        where: { id: event.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          attempts: { increment: 1 },
          matchQuality: calculateMatchQuality(hashedUserData),
          metaResponse,
        },
      })
      sent++
    } catch (err: any) {
      const attempts = event.attempts + 1
      await prisma.cAPIEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= 3 ? 'failed' : 'queued',
          attempts: { increment: 1 },
          metaResponse: { error: err?.response?.data || err.message },
        },
      })
      failed++
    }
  }

  return NextResponse.json({ processed: events.length, sent, failed })
}
