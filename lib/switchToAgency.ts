import type { WorkspaceInfo } from './store/auth'

// Troca de volta pro workspace da agência a partir de qualquer contexto de cliente — usado
// pelos editores de Estúdio de Criação quando chegam com ?fromAgency=1 (ver Tarefas > Criação),
// pra devolver o admin pro hub da agência em vez de deixá-lo preso na área do cliente depois
// de abrir o editor (que precisa entrar de verdade no workspace do cliente pra funcionar).
export async function switchToAgency(
  token: string | null,
  accessibleWorkspaces: WorkspaceInfo[],
  switchWorkspace: (token: string, workspace: WorkspaceInfo) => void,
): Promise<boolean> {
  const agency = accessibleWorkspaces.find(w => w.isAgency)
  if (!agency || !token) return false
  try {
    const res = await fetch('/api/auth/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId: agency.id }),
    })
    const data = await res.json()
    if (!res.ok) return false
    switchWorkspace(data.token, data.workspace)
    return true
  } catch {
    return false
  }
}
