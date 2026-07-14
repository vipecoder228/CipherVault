import { create } from 'zustand'

interface UIState {
  theme: 'dark' | 'light'
  sidebarCollapsed: boolean
  activeCategoryId: number | null
  showPasswordGenerator: boolean
  showSettings: boolean
  showDisposableEmail: boolean
  showTrash: boolean

  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleSidebar: () => void
  setActiveCategory: (id: number | null) => void
  setShowPasswordGenerator: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowDisposableEmail: (show: boolean) => void
  setShowTrash: (show: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  sidebarCollapsed: false,
  activeCategoryId: null,
  showPasswordGenerator: false,
  showSettings: false,
  showDisposableEmail: false,
  showTrash: false,

  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', newTheme)
    return { theme: newTheme }
  }),

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActiveCategory: (id) => set({ activeCategoryId: id }),
  setShowPasswordGenerator: (show) => set({ showPasswordGenerator: show }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowDisposableEmail: (show) => set({ showDisposableEmail: show }),
  setShowTrash: (show) => set({ showTrash: show }),
}))
