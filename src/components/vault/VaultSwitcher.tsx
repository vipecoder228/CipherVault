import { useState } from 'react'
import { invoke } from '../../lib/ipc'
import { useVaultStore } from '../../store/vaultStore'
import { ChevronDown, Plus, Lock } from 'lucide-react'

export function VaultSwitcher() {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [newVaultPassword, setNewVaultPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const { activeVaultId, vaults, switchVault, lock } = useVaultStore()

  const currentVault = vaults.find(v => v.id === activeVaultId)

  async function handleCreateVault() {
    if (!newVaultName.trim() || !newVaultPassword.trim()) return

    setCreating(true)
    try {
      const result = await invoke('vault:create', newVaultPassword, newVaultName)
      if (result.success) {
        setShowCreateModal(false)
        setNewVaultName('')
        setNewVaultPassword('')
        await useVaultStore.getState().checkStatus()
      }
    } catch (err) {
      console.error('Failed to create vault:', err)
    }
    setCreating(false)
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-vault-surface-hover transition-colors"
        >
          <Lock size={16} className="text-vault-accent" />
          <span className="flex-1 text-left text-sm text-vault-text truncate">
            {currentVault?.displayName || 'Main Vault'}
          </span>
          <ChevronDown size={14} className={`text-vault-text-secondary transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
            <div className="absolute left-0 right-0 mt-1 bg-vault-surface border border-vault-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
              {vaults.map(vault => (
                <button
                  key={vault.id}
                  onClick={() => {
                    switchVault(vault.id)
                    setShowDropdown(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-vault-surface-hover transition-colors ${
                    vault.id === activeVaultId ? 'bg-vault-accent/10 text-vault-accent' : 'text-vault-text'
                  }`}
                >
                  <Lock size={14} />
                  <span className="text-sm truncate">{vault.displayName}</span>
                </button>
              ))}
              <div className="border-t border-vault-border">
                <button
                  onClick={() => {
                    setShowDropdown(false)
                    setShowCreateModal(true)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-vault-text-secondary hover:bg-vault-surface-hover transition-colors"
                >
                  <Plus size={14} />
                  <span className="text-sm">Create new vault</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Vault Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-vault-surface border border-vault-border rounded-xl p-6 w-[400px] shadow-xl">
            <h3 className="text-lg font-semibold text-vault-text mb-4">Create New Vault</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-vault-text-secondary mb-1">Vault Name</label>
                <input
                  type="text"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  placeholder="e.g., Work, Personal"
                  className="w-full px-3 py-2 bg-vault-bg border border-vault-border rounded-lg text-vault-text placeholder-vault-text-secondary focus:outline-none focus:border-vault-accent"
                />
              </div>

              <div>
                <label className="block text-sm text-vault-text-secondary mb-1">Master Password</label>
                <input
                  type="password"
                  value={newVaultPassword}
                  onChange={(e) => setNewVaultPassword(e.target.value)}
                  placeholder="Enter a strong password"
                  className="w-full px-3 py-2 bg-vault-bg border border-vault-border rounded-lg text-vault-text placeholder-vault-text-secondary focus:outline-none focus:border-vault-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-vault-text-secondary hover:text-vault-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVault}
                disabled={!newVaultName.trim() || !newVaultPassword.trim() || creating}
                className="px-4 py-2 bg-vault-accent text-white rounded-lg text-sm font-medium hover:bg-vault-accent-hover transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
