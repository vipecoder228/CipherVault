import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { FolderOpen, RefreshCw, CloudOff, Cloud, Check } from 'lucide-react'

export function SyncSettings() {
  const [enabled, setEnabled] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const result = await invoke('sync:load-settings')
      setEnabled(result.enabled)
      setFolder(result.folder)
    } catch {}
  }

  const handleSelectFolder = async () => {
    setLoading(true)
    try {
      const result = await invoke('sync:select-folder')
      if (result.success && result.folder) {
        setFolder(result.folder)
        setEnabled(true)
        addToast(`Sync folder set: ${result.folder}`, 'success')
      }
    } catch {
      addToast('Failed to select folder', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSetPassword = async () => {
    if (!password) {
      addToast('Enter sync password', 'warning')
      return
    }
    await invoke('sync:set-password', password)
    addToast('Sync password set', 'success')
  }

  const handleSyncNow = async () => {
    if (!password) {
      addToast('Enter sync password first', 'warning')
      return
    }
    setSyncing(true)
    try {
      await invoke('sync:set-password', password)
      const result = await invoke('sync:now')
      if (result.success) {
        addToast('Synced successfully', 'success')
        setLastSyncTime(Date.now())
      } else {
        addToast(result.error || 'Sync failed', 'error')
      }
    } catch {
      addToast('Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleDisable = async () => {
    if (!confirm('Disable sync? The sync file in the folder will not be deleted.')) return
    try {
      await invoke('sync:disable')
      setEnabled(false)
      setFolder(null)
      setPassword('')
      addToast('Sync disabled', 'success')
    } catch {
      addToast('Failed to disable sync', 'error')
    }
  }

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never'
    const diff = Date.now() - lastSyncTime
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
    return new Date(lastSyncTime).toLocaleTimeString()
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-vault-bg border border-vault-border">
        {enabled ? (
          <Cloud size={20} className="text-vault-success" />
        ) : (
          <CloudOff size={20} className="text-vault-text-secondary" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-vault-text">
            {enabled ? 'Sync Enabled' : 'Sync Disabled'}
          </p>
          {folder && (
            <p className="text-xs text-vault-text-secondary truncate">{folder}</p>
          )}
        </div>
        {enabled && (
          <span className="text-xs text-vault-text-secondary">
            Last sync: {formatLastSync()}
          </span>
        )}
      </div>

      {/* Folder selection */}
      {!enabled && (
        <Button variant="secondary" onClick={handleSelectFolder} disabled={loading} className="w-full">
          <FolderOpen size={16} className="mr-2" />
          {loading ? 'Selecting...' : 'Select Sync Folder'}
        </Button>
      )}

      {/* Sync password */}
      {enabled && (
        <>
          <Input
            label="Sync Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter sync password"
            showPasswordToggle
          />
          <p className="text-[10px] text-vault-text-secondary">
            This password encrypts the sync file. Use the same password on all devices.
          </p>
        </>
      )}

      {/* Actions */}
      {enabled && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleSyncNow}
            disabled={syncing || !password}
            className="flex-1"
          >
            {syncing ? (
              <RefreshCw size={16} className="mr-2 animate-spin" />
            ) : (
              <RefreshCw size={16} className="mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Button variant="danger" onClick={handleDisable} className="flex-1">
            Disable
          </Button>
        </div>
      )}
    </div>
  )
}
