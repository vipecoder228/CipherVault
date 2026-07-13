import { create } from 'zustand'
import { invoke } from '../lib/ipc'

interface VaultState {
  locked: boolean
  initialized: boolean
  loading: boolean
  error: string | null
  requiresTotp: boolean
  pendingPassword: string | null
  alarmMode: boolean

  checkStatus: () => Promise<void>
  setup: (masterPassword: string, alarmPassword?: string) => Promise<boolean>
  unlock: (masterPassword: string, totpCode?: string) => Promise<boolean>
  lock: () => Promise<void>
  clearError: () => void
  resetTotpState: () => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  locked: true,
  initialized: false,
  loading: false,
  error: null,
  requiresTotp: false,
  pendingPassword: null,
  alarmMode: false,

  checkStatus: async () => {
    try {
      const status = await invoke('vault:status')
      set({ locked: status.locked, initialized: status.initialized })
    } catch (err) {
      console.error('Failed to check vault status:', err)
    }
  },

  setup: async (masterPassword: string, alarmPassword?: string) => {
    set({ loading: true, error: null })
    try {
      const result = await invoke('vault:setup', masterPassword, alarmPassword)
      if (result.success) {
        set({ locked: false, initialized: true, loading: false, alarmMode: false })
        return true
      } else {
        set({ error: result.error || 'Setup failed', loading: false })
        return false
      }
    } catch (err) {
      set({ error: 'An unexpected error occurred', loading: false })
      return false
    }
  },

  unlock: async (masterPassword: string, totpCode?: string) => {
    set({ loading: true, error: null })
    try {
      const result = await invoke('vault:unlock', masterPassword, totpCode)
      if (result.success) {
        set({
          locked: false,
          loading: false,
          requiresTotp: false,
          pendingPassword: null,
          alarmMode: result.alarmMode || false
        })
        return true
      } else if (result.requiresTotp) {
        set({
          requiresTotp: true,
          pendingPassword: masterPassword,
          loading: false,
          error: null
        })
        return false
      } else {
        set({ error: result.error || 'Unlock failed', loading: false, pendingPassword: null })
        return false
      }
    } catch (err) {
      set({ error: 'An unexpected error occurred', loading: false })
      return false
    }
  },

  lock: async () => {
    await invoke('vault:lock')
    set({ locked: true, requiresTotp: false, pendingPassword: null, alarmMode: false })
  },

  clearError: () => set({ error: null }),
  resetTotpState: () => set({ requiresTotp: false, pendingPassword: null }),
}))

// Listen for vault:locked event from main process
if (typeof window !== 'undefined' && window.electronAPI?.on) {
  window.electronAPI.on('vault:locked', () => {
    useVaultStore.setState({
      locked: true,
      requiresTotp: false,
      pendingPassword: null,
      alarmMode: false,
    })
  })
}
