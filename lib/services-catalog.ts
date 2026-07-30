// Os 7 serviços com feature-gate/painel próprio no Dash — campos svc* booleanos direto no
// Workspace. Usado pelo link público de checkup de serviços (app/checkup-servicos/[token]);
// clientes/[id]/page.tsx mantém sua própria cópia com ícone, que não precisa mudar.
export const CORE_SERVICES: { key: string; label: string }[] = [
  { key: 'svcMetaAds', label: 'Tráfego Meta' },
  { key: 'svcGoogleAds', label: 'Tráfego Google Ads' },
  { key: 'svcGoogleLocal', label: 'Tráfego GLS' },
  { key: 'svcSocialMedia', label: 'Social Media' },
  { key: 'svcGoogleBusiness', label: 'Google Business' },
  { key: 'svcContentStudio', label: 'Estúdio de Criação (IA)' },
  { key: 'svcSiteGenerator', label: 'Gerador de Sites (IA)' },
]

// Serviços do catálogo da agência sem feature-gate próprio no app (ver comentário do model
// WorkspaceService em prisma/schema.prisma). Os 5 serviços "recorrentes" com painel de
// acompanhamento no Dash (Meta Ads, Google Ads, Google Local, Social Media, Google Business)
// continuam nos campos svc* do Workspace, definidos onde já eram (clientes/page.tsx e
// clientes/[id]/page.tsx) — não duplicados aqui.
export const EXTRA_SERVICES: { key: string; label: string }[] = [
  { key: 'id_visual', label: 'ID Visual' },
  { key: 'consultoria', label: 'Consultoria' },
  { key: 'estruturacao_estrategica', label: 'Estruturação Estratégica' },
  { key: 'website', label: 'Website' },
  { key: 'ecommerce', label: 'E-commerce' },
  { key: 'automacao_bc', label: 'Automação BC' },
  { key: 'automacao_agente', label: 'Automação Agente' },
  { key: 'sistemas', label: 'Sistemas' },
  { key: 'disparo_massa', label: 'Disparo em Massa' },
  { key: 'gestao_infoprodutos', label: 'Gestão InfoProdutos' },
  { key: 'gestao_canal_youtube', label: 'Gestão Canal Youtube' },
  { key: 'registro_marca', label: 'Registro de Marca' },
]
