import { create } from 'zustand'
import { invoke } from '../lib/ipc'
import { useEntriesStore } from './entriesStore'

interface VaultInfo {
  id: number
  displayName: string
}

interface VaultState {
  locked: boolean
  initialized: boolean
  loading: boolean
  error: string | null
  requiresTotp: boolean
  pendingPassword: string | null
  alarmMode: boolean
  activeVaultId: number
  vaults: VaultInfo[]

  checkStatus: () => Promise<void>
  setup: (masterPassword: string, alarmPassword?: string, displayName?: string) => Promise<boolean>
  unlock: (masterPassword: string, totpCode?: string, vaultId?: number) => Promise<boolean>
  lock: () => Promise<void>
  switchVault: (vaultId: number) => void
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
  activeVaultId: 1,
  vaults: [],

  checkStatus: async () => {
    try {
      const status = await invoke('vault:status')
      set({
        locked: status.locked,
        initialized: status.initialized,
        activeVaultId: status.activeVaultId,
        vaults: status.vaults,
      })
    } catch (err) {
      console.error('Failed to check vault status:', err)
    }
  },

  setup: async (masterPassword: string, alarmPassword?: string, displayName?: string) => {
    set({ loading: true, error: null })
    try {
      const result = await invoke('vault:setup', masterPassword, alarmPassword, displayName)
      if (result.success) {
        // Refresh vault list
        const status = await invoke('vault:status')
        set({
          locked: false,
          initialized: true,
          loading: false,
          alarmMode: false,
          activeVaultId: status.activeVaultId,
          vaults: status.vaults,
        })
        return true
      } else {
        set({ error: result.error || 'Setup failed', loading: false })
        return false
      }
    } catch (err: any) {
      console.error('Vault setup error:', err)
      set({ error: err?.message || 'An unexpected error occurred', loading: false })
      return false
    }
  },

  unlock: async (masterPassword: string, totpCode?: string, vaultId?: number) => {
    set({ loading: true, error: null })
    try {
      const result = await invoke('vault:unlock', masterPassword, totpCode, vaultId)
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
        set((state) => ({
          error: result.error || 'Unlock failed',
          loading: false,
          pendingPassword: state.requiresTotp ? state.pendingPassword : null,
        }))
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
    // Clear entries so they don't leak into alarm mode
    useEntriesStore.setState({ entries: [], selectedEntry: null })
  },

  switchVault: (vaultId: number) => {
    set({ activeVaultId: vaultId })
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
    useEntriesStore.setState({ entries: [], selectedEntry: null })
  })
}

// Listen for web vault lock event (auto-lock in Capacitor/web)
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.addEventListener('webvault:locked', () => {
    useVaultStore.setState({
      locked: true,
      requiresTotp: false,
      pendingPassword: null,
      alarmMode: false,
    })
    useEntriesStore.setState({ entries: [], selectedEntry: null })
  })
}
