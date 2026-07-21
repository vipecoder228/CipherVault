import { create } from 'zustand'

export type AuditAction = 'copy_password' | 'copy_username' | 'copy_url' | 'view_password' | 'create_entry' | 'update_entry' | 'delete_entry' | 'export' | 'import'

interface AuditEntry {
  id: string
  action: AuditAction
  entryTitle?: string
  timestamp: number
}

interface AuditState {
  entries: AuditEntry[]
  addEntry: (action: AuditAction, entryTitle?: string) => void
  getEntries: (limit?: number) => AuditEntry[]
  clearEntries: () => void
}

const MAX_ENTRIES = 100

export const useAuditStore = create<AuditState>((set, get) => ({
  entries: [],

  addEntry: (action, entryTitle) => {
    const entry: AuditEntry = {
      id: Math.random().toString(36).slice(2),
      action,
      entryTitle,
      timestamp: Date.now(),
    }
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
    }))
  },

  getEntries: (limit = 20) => {
    return get().entries.slice(0, limit)
  },

  clearEntries: () => set({ entries: [] }),
}))
