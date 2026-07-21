import { create } from 'zustand'

interface ClipboardItem {
  id: string
  label: string
  type: 'password' | 'username' | 'url' | 'other'
  timestamp: number
}

interface ClipboardState {
  items: ClipboardItem[]
  addItem: (label: string, type: ClipboardItem['type']) => void
  clearItems: () => void
}

const MAX_ITEMS = 10

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  items: [],

  addItem: (label, type) => {
    const item: ClipboardItem = {
      id: Math.random().toString(36).slice(2),
      label,
      type,
      timestamp: Date.now(),
    }
    set((state) => ({
      items: [item, ...state.items].slice(0, MAX_ITEMS),
    }))
  },

  clearItems: () => set({ items: [] }),
}))
