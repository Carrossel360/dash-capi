'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface User { id: string; name: string; email: string }

export interface WorkspaceServices {
  trafeqoPago: boolean // legado — ver metaAds/googleAds
  metaAds: boolean
  googleAds: boolean
  socialMedia: boolean
  googleBusiness: boolean
  googleLocal: boolean
  contentStudio: boolean
}

export interface WorkspaceInfo {
  id: string; name: string; slug: string
  segment?: string | null; isAgency?: boolean; role?: string
  currency?: string
  services?: WorkspaceServices
  metaVisibleMetrics?: string[]
  googleVisibleMetrics?: string[]
  funnelMetrics?: string[]
  googleFunnelMetrics?: string[]
}

interface AuthState {
  user: User | null
  token: string | null
  workspaceId: string | null
  currentWorkspace: WorkspaceInfo | null
  accessibleWorkspaces: WorkspaceInfo[]
  isAuthenticated: boolean
  _hydrated: boolean
  login: (user: User, token: string, workspace: WorkspaceInfo) => void
  logout: () => void
  setHydrated: () => void
  setAccessibleWorkspaces: (workspaces: WorkspaceInfo[]) => void
  switchWorkspace: (token: string, workspace: WorkspaceInfo) => void
  updateCurrentWorkspace: (updates: Partial<WorkspaceInfo>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      workspaceId: null,
      currentWorkspace: null,
      accessibleWorkspaces: [],
      isAuthenticated: false,
      _hydrated: false,
      login: (user, token, workspace) =>
        set({ user, token, workspaceId: workspace.id, currentWorkspace: workspace, isAuthenticated: true }),
      logout: () =>
        set({ user: null, token: null, workspaceId: null, currentWorkspace: null, accessibleWorkspaces: [], isAuthenticated: false }),
      setHydrated: () => set({ _hydrated: true }),
      setAccessibleWorkspaces: (workspaces) => set({ accessibleWorkspaces: workspaces }),
      switchWorkspace: (token, workspace) =>
        set({ token, workspaceId: workspace.id, currentWorkspace: workspace }),
      updateCurrentWorkspace: (updates) =>
        set(state => ({
          currentWorkspace: state.currentWorkspace ? { ...state.currentWorkspace, ...updates } : null,
        })),
    }),
    {
      name: 'carrossel360-auth',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => { state?.setHydrated() },
    }
  )
)
