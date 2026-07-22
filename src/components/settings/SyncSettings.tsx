import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useI18n } from '../../i18n'
import { setSyncPasswordEncrypted } from '../../services/googleDriveSync'
import { FolderOpen, RefreshCw, CloudOff, Cloud } from 'lucide-react'

export function SyncSettings() {
  const { t } = useI18n()
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
        addToast(t('sync_folder_set', { folder: result.folder }), 'success')
      }
    } catch {
      addToast(t('failed_select_folder'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncNow = async () => {
    if (!password) {
      addToast(t('enter_sync_password_first'), 'warning')
      return
    }
    setSyncing(true)
    try {
      // Store encrypted sync password
      await setSyncPasswordEncrypted(password)
      await invoke('sync:set-password', password)
      const result = await invoke('sync:now')
      if (result.success) {
        addToast(t('synced_successfully'), 'success')
        setLastSyncTime(Date.now())
      } else {
        addToast(result.error || t('sync_failed'), 'error')
      }
    } catch {
      addToast(t('sync_failed'), 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleDisable = async () => {
    if (!confirm(t('confirm_disable_sync'))) return
    try {
      await invoke('sync:disable')
      setEnabled(false)
      setFolder(null)
      setPassword('')
      addToast(t('sync_disabled'), 'success')
    } catch {
      addToast(t('failed_disable_sync'), 'error')
    }
  }

  const formatLastSync = () => {
    if (!lastSyncTime) return t('never')
    const diff = Date.now() - lastSyncTime
    if (diff < 60000) return t('just_now')
    if (diff < 3600000) return t('minutes_ago', { n: Math.floor(diff / 60000) })
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
            {enabled ? t('sync_enabled') : t('sync_disabled_label')}
          </p>
          {folder && (
            <p className="text-xs text-vault-text-secondary truncate">{folder}</p>
          )}
        </div>
        {enabled && (
          <span className="text-xs text-vault-text-secondary">
            {t('last_sync')}: {formatLastSync()}
          </span>
        )}
      </div>

      {/* Folder selection */}
      {!enabled && (
        <Button variant="secondary" onClick={handleSelectFolder} disabled={loading} className="w-full">
          <FolderOpen size={16} className="mr-2" />
          {loading ? t('selecting') : t('select_sync_folder')}
        </Button>
      )}

      {/* Sync password */}
      {enabled && (
        <>
          <Input
            label={t('sync_password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('enter_sync_password')}
            showPasswordToggle
          />
          <p className="text-[10px] text-vault-text-secondary">
            {t('sync_password_hint')}
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
            {syncing ? t('syncing') : t('sync_now')}
          </Button>
          <Button variant="danger" onClick={handleDisable} className="flex-1">
            {t('disable')}
          </Button>
        </div>
      )}
    </div>
  )
}
