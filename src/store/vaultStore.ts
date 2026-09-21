import { create } from 'zustand'
import { invoke } from '../lib/ipc'
import { useEntriesStore } from './entriesStore'

// Module-level storage for pending TOTP password (not exposed via React state)
let _pendingPassword: string | null = null

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
  alarmMode: boolean
  activeVaultId: number
  vaults: VaultInfo[]
  verifiedSecureNotes: Set<number>

  checkStatus: () => Promise<void>
  setup: (masterPassword: string, alarmPassword?: string, displayName?: string) => Promise<boolean>
  unlock: (masterPassword: string, totpCode?: string, vaultId?: number) => Promise<boolean>
  lock: () => Promise<void>
  switchVault: (vaultId: number) => Promise<void>
  clearError: () => void
  resetTotpState: () => void
  verifySecureNote: (noteId: number, password: string) => Promise<boolean>
  isSecureNoteVerified: (noteId: number) => boolean
}

export const useVaultStore = create<VaultState>((set, get) => ({
  locked: true,
  initialized: false,
  loading: false,
  error: null,
  requiresTotp: false,
  alarmMode: false,
  activeVaultId: 1,
  vaults: [],
  verifiedSecureNotes: new Set(),

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
        _pendingPassword = null
        set({
          locked: false,
          loading: false,
          requiresTotp: false,
          alarmMode: result.alarmMode || false
        })
        return true
      } else if (result.requiresTotp) {
        _pendingPassword = masterPassword
        set({
          requiresTotp: true,
          loading: false,
          error: null
        })
        return false
      } else {
        _pendingPassword = null
        set((state) => ({
          error: result.error || 'Unlock failed',
          loading: false,
        }))
        return false
      }
    } catch (err: any) {
      _pendingPassword = null
      console.error('Vault unlock error:', err)
      set({ error: err?.message || 'An unexpected error occurred', loading: false })
      return false
    }
  },

  lock: async () => {
    try {
      await invoke('vault:lock')
    } catch {
      // Still clean up state even if IPC fails
    }
    _pendingPassword = null
    set({ locked: true, requiresTotp: false, alarmMode: false, verifiedSecureNotes: new Set() })
    useEntriesStore.setState({ entries: [], selectedEntry: null })
  },

  switchVault: async (vaultId: number) => {
    if (vaultId === get().activeVaultId) return
    // Backend requires the vault to be locked before switching, and re-derives
    // the encryption key for the new vault on next unlock — so lock first and
    // let the UnlockScreen handle re-authentication for the target vault.
    if (!get().locked) {
      await get().lock()
    }
    try {
      const result = await invoke('vault:switch', vaultId)
      if (result.success) {
        set({ activeVaultId: vaultId })
      } else {
        set({ error: result.error || 'Failed to switch vault' })
      }
    } catch (err: any) {
      set({ error: err?.message || 'Failed to switch vault' })
    }
  },

  clearError: () => set({ error: null }),
  resetTotpState: () => { _pendingPassword = null; set({ requiresTotp: false }) },

  verifySecureNote: async (noteId: number, password: string) => {
    // No biometric bypass — always verify password via IPC
    if (!password || typeof password !== 'string') return false
    try {
      const result = await invoke('vault:verify-password' as any, password)
      if (result) {
        set((state) => {
          const next = new Set(state.verifiedSecureNotes)
          next.add(noteId)
          return { verifiedSecureNotes: next }
        })
        return true
      }
      return false
    } catch {
      return false
    }
  },

  isSecureNoteVerified: (noteId: number) => {
    return get().verifiedSecureNotes.has(noteId)
  },
}))

// Listen for vault:locked event from main process
if (typeof window !== 'undefined' && window.electronAPI?.on) {
  window.electronAPI.on('vault:locked', () => {
    _pendingPassword = null
    useVaultStore.setState({
      locked: true,
      requiresTotp: false,
      alarmMode: false,
      verifiedSecureNotes: new Set(),
    })
    useEntriesStore.setState({ entries: [], selectedEntry: null })
  })
}

// Listen for web vault lock event (auto-lock in Capacitor/web)
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.addEventListener('webvault:locked', () => {
    _pendingPassword = null
    useVaultStore.setState({
      locked: true,
      requiresTotp: false,
      alarmMode: false,
      verifiedSecureNotes: new Set(),
    })
    useEntriesStore.setState({ entries: [], selectedEntry: null })
  })
}
