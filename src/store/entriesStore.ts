import { create } from 'zustand'
import { invoke } from '../lib/ipc'
import type { EncryptedEntry, DecryptedEntry, CreateEntryPayload, UpdateEntryPayload, EntryFilters } from '@shared/types'

export type SortField = 'updated_at' | 'display_title' | 'entry_type'
export type SortDir = 'asc' | 'desc'

interface EntriesState {
  entries: EncryptedEntry[]
  selectedEntry: DecryptedEntry | null
  viewMode: 'grid' | 'list'
  filters: EntryFilters
  searchQuery: string
  loading: boolean
  sortField: SortField
  sortDir: SortDir

  loadEntries: (filters?: EntryFilters) => Promise<void>
  selectEntry: (id: number | null) => Promise<void>
  createEntry: (data: CreateEntryPayload) => Promise<void>
  updateEntry: (id: number, data: UpdateEntryPayload) => Promise<void>
  deleteEntry: (id: number) => Promise<void>
  toggleFavorite: (id: number) => Promise<void>
  search: (query: string) => Promise<void>
  setViewMode: (mode: 'grid' | 'list') => void
  setFilters: (filters: EntryFilters) => void
  setSort: (field: SortField, dir?: SortDir) => void
}

function sortEntries(entries: EncryptedEntry[], field: SortField, dir: SortDir): EncryptedEntry[] {
  const sorted = [...entries].sort((a, b) => {
    let comparison = 0
    if (field === 'display_title') {
      comparison = (a.display_title || '').localeCompare(b.display_title || '')
    } else if (field === 'entry_type') {
      comparison = a.entry_type.localeCompare(b.entry_type)
    } else {
      comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    }
    return dir === 'asc' ? comparison : -comparison
  })
  return sorted
}

export const useEntriesStore = create<EntriesState>((set, get) => {
  let loadRequestId = 0

  return {
    entries: [],
    selectedEntry: null,
    viewMode: 'list',
    filters: {},
    searchQuery: '',
    loading: false,
    sortField: 'updated_at',
    sortDir: 'desc',

    loadEntries: async (filters?: EntryFilters) => {
      const requestId = ++loadRequestId
      set({ loading: true })
      try {
        const f = filters ?? get().filters
        const entries = await invoke('entries:list', f)
        if (requestId !== loadRequestId) return
        const sorted = sortEntries(entries, get().sortField, get().sortDir)
        set({ entries: sorted, loading: false })
      } catch {
        if (requestId !== loadRequestId) return
        set({ loading: false })
      }
    },

  selectEntry: async (id: number | null) => {
    if (id === null) {
      set({ selectedEntry: null })
      return
    }
    try {
      const entry = await invoke('entries:get', id)
      set({ selectedEntry: entry })
    } catch {
      set({ selectedEntry: null })
    }
  },

  createEntry: async (data: CreateEntryPayload) => {
    await invoke('entries:create', data)
    await get().loadEntries()
  },

  updateEntry: async (id: number, data: UpdateEntryPayload) => {
    await invoke('entries:update', id, data)
    await get().loadEntries()
    const selected = get().selectedEntry
    if (selected?.id === id) {
      await get().selectEntry(id)
    }
  },

  deleteEntry: async (id: number) => {
    await invoke('entries:delete', id)
    const selected = get().selectedEntry
    if (selected?.id === id) {
      set({ selectedEntry: null })
    }
    await get().loadEntries()
  },

  toggleFavorite: async (id: number) => {
    await invoke('entries:toggle-favorite', id)
    await get().loadEntries()
  },

  search: async (query: string) => {
    if (!query.trim()) {
      set({ searchQuery: '' })
      return get().loadEntries()
    }
    set({ loading: true, searchQuery: query.trim() })
    try {
      const f = get().filters
      const entries = await invoke('entries:search', query, f)
      const sorted = sortEntries(entries, get().sortField, get().sortDir)
      set({ entries: sorted, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setFilters: (filters) => {
    set({ filters })
    get().loadEntries(filters)
  },
  setSort: (field, dir) => {
    const currentDir = get().sortDir
    const newDir = dir || (get().sortField === field && currentDir === 'desc' ? 'asc' : 'desc')
    set({ sortField: field, sortDir: newDir })
    const entries = get().entries
    set({ entries: sortEntries(entries, field, newDir) })
  },
  }
})
