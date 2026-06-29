import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateEventId } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId, eventType, url, referrer, userAgent,
      fbclid, gclid, utmSource, utmMedium, utmCampaign,
      utmContent, utmTerm, userEmail, userPhone, customData,
      fbp, fbc,
    } = body

    if (!workspaceId || !eventType) {
      return NextResponse.json({ error: 'workspaceId e eventType obrigatórios' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })
    if (!workspace) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })

    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || ''
    const ua = userAgent || req.headers.get('user-agent') || ''

    const cookieHeader = req.headers.get('cookie') || ''
    const resolvedFbp = fbp || cookieHeader.match(/_fbp=([^;]+)/)?.[1] || null
    const resolvedFbc = fbc || cookieHeader.match(/_fbc=([^;]+)/)?.[1] ||
      (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null)

    await prisma.trackerEvent.create({
      data: {
        workspaceId,
        eventType,
        url: url || '',
        referrer,
        userAgent: ua,
        ip,
        fbclid,
        gclid,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        userEmail,
        userPhone,
        fbp: resolvedFbp,
        fbc: resolvedFbc,
        sentAt: new Date(),
      },
    })

    // Enfileira CAPI para eventos relevantes
    const capiEvents = ['Lead', 'Purchase', 'InitiateCheckout', 'WhatsAppClick']
    if (capiEvents.includes(eventType)) {
      await prisma.cAPIEvent.create({
        data: {
          workspaceId,
          eventName: eventType,
          eventTime: new Date(),
          eventId: generateEventId(),
          source: 'site',
          status: 'queued',
          userData: { email: userEmail, phone: userPhone, ip, userAgent: ua, fbp: resolvedFbp, fbc: resolvedFbc },
          customData: customData || null,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// Permite CORS para o tracker no site do cliente
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
