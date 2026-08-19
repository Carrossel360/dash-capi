import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, isAgencyStaff } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CORE_SERVICES, EXTRA_SERVICES } from '@/lib/services-catalog'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const agencyStaff = await isAgencyStaff(auth.userId)
  const clients = await prisma.workspace.findMany({
    where: agencyStaff ? { isAgency: false, isActive: true } : { id: auth.workspaceId },
    select: {
      id: true, name: true,
      svcMetaAds: true, svcGoogleAds: true, svcGoogleLocal: true, svcSocialMedia: true,
      svcGoogleBusiness: true, svcContentStudio: true, svcSiteGenerator: true,
      extraServices: { select: { key: true } },
    },
    orderBy: { name: 'asc' },
  })
  const serviceCatalog = [...CORE_SERVICES, ...EXTRA_SERVICES]
  return NextResponse.json({
    clients: clients.map(client => ({
      id: client.id,
      name: client.name,
      services: serviceCatalog.filter(service =>
        service.key.startsWith('svc')
          ? Boolean(client[service.key as keyof typeof client])
          : client.extraServices.some(item => item.key === service.key),
      ),
    })),
    serviceCatalog,
  })
}
