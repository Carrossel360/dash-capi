// Compartilhado entre components/Sidebar.tsx (o que aparece no menu) e a página de login
// (pra onde redirecionar depois de entrar) — evita as duas regras divergirem com o tempo.

// Únicos itens visíveis pro papel "atendente" num workspace de cliente — vê só o
// operacional do dia a dia (CRM + conversas), nada de métricas/configuração/áreas em construção.
export const ATTENDANT_ALLOWED_HREFS = ['/pipeline', '/conversas']

export function defaultRouteForRole(workspace: { isAgency?: boolean; role?: string } | null | undefined): string {
  const isAgency = workspace?.isAgency ?? true
  if (!isAgency && workspace?.role === 'attendant') return ATTENDANT_ALLOWED_HREFS[0]
  return '/dashboard'
}
