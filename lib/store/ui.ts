'use client'
import { create } from 'zustand'

// Estado de UI puramente local (não persiste) — hoje só controla o drawer do
// Sidebar em telas mobile, onde ele não cabe fixo na tela como no desktop.
interface UIState {
  mobileNavOpen: boolean
  toggleMobileNav: () => void
  closeMobileNav: () => void
}

export const useUIStore = create<UIState>((set) => ({
  mobileNavOpen: false,
  toggleMobileNav: () => set(s => ({ mobileNavOpen: !s.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),
}))
