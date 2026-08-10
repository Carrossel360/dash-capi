import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const summary = {
  totalLinhasBc: 2874,
  leadsUnicos: 1921,
  duplicatas: 953,
  leadsConvertidos: 403,
  leadsNaoConvertidos: 1518,
  faturamentoTotal: 118063.27,
  ticketMedio: 292.96,
  taxaConversao: 20.98,
  leadsCrmTotal: 1081,
  obs: 'Duplicata = mesmo telefone no mesmo mês. Mesmo telefone em meses diferentes é retorno (contado separadamente). Lead BC fev-ago/2026 · CRM até 01/08/2026. Agosto/26 parcial.',
}

const rows = [
  ['total', 'Google', 523, 114, 36482.67],
  ['total', 'Meta', 117, 24, 6387.00],
  ['total', 'Indefinido', 1281, 265, 75193.60],
  ['2026-02', 'Google', 41, 11, 2760.00],
  ['2026-02', 'Meta', 31, 5, 1310.00],
  ['2026-02', 'Indefinido', 58, 10, 3650.00],
  ['2026-03', 'Google', 85, 19, 6202.00],
  ['2026-03', 'Meta', 14, 4, 1070.00],
  ['2026-03', 'Indefinido', 133, 22, 5660.00],
  ['2026-04', 'Google', 94, 22, 6562.70],
  ['2026-04', 'Meta', 13, 4, 350.00],
  ['2026-04', 'Indefinido', 128, 24, 7286.00],
  ['2026-05', 'Google', 85, 18, 7219.60],
  ['2026-05', 'Meta', 14, 2, 400.00],
  ['2026-05', 'Indefinido', 213, 61, 18011.80],
  ['2026-06', 'Google', 78, 13, 4324.00],
  ['2026-06', 'Meta', 18, 3, 1027.00],
  ['2026-06', 'Indefinido', 235, 59, 17395.80],
  ['2026-07', 'Google', 109, 29, 8643.47],
  ['2026-07', 'Meta', 23, 6, 2230.00],
  ['2026-07', 'Indefinido', 415, 74, 21070.10],
  ['2026-08', 'Google', 31, 2, 770.90],
  ['2026-08', 'Meta', 4, 0, 0.00],
  ['2026-08', 'Indefinido', 99, 15, 2119.90],
] as const

async function main() {
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ name: { equals: 'Matri', mode: 'insensitive' } }, { slug: 'matri' }] },
    select: { id: true, name: true, slug: true },
  })
  if (!workspace) throw new Error('Workspace Matri não encontrado')

  await prisma.leadReconciliationSummary.upsert({
    where: { workspaceId: workspace.id },
    update: summary,
    create: { workspaceId: workspace.id, ...summary },
  })

  for (const [period, origin, leadsUnicos, convertidos, faturamento] of rows) {
    const month = period === 'total' ? null : new Date(`${period}-01T00:00:00.000Z`)
    await prisma.leadReconciliationRow.upsert({
      where: { workspaceId_origin_period: { workspaceId: workspace.id, origin, period } },
      update: { leadsUnicos, convertidos, faturamento, month },
      create: { workspaceId: workspace.id, period, origin, leadsUnicos, convertidos, faturamento, month },
    })
  }

  console.log(`Seed Matri OK: ${workspace.name} (${workspace.id})`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => prisma.$disconnect())
