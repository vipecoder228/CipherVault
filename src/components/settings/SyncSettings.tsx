import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useI18n } from '../../i18n'
import { setSyncPasswordEncrypted } from '../../lib/secureStorage'
import { cn } from '../../lib/utils'
import type { SyncServerStatus } from '@shared/types'
import { FolderOpen, RefreshCw, CloudOff, Cloud, Server, Upload, Download, LogOut, Trash2 } from 'lucide-react'

type Provider = 'local' | 'server'

const DEFAULT_SERVER_STATUS: SyncServerStatus = {
  configured: false,
  serverUrl: null,
  loggedIn: false,
  username: null,
  deviceId: null,
  deviceName: null,
  lastSeenVersion: 0,
  lastSyncTime: 0,
}

export function SyncSettings() {
  const { t } = useI18n()
  const addToast = useToastStore((s) => s.addToast)

  // Which provider is active — mutually exclusive, switching one disables the other.
  const [provider, setProvider] = useState<Provider>('local')

  // Local folder provider state
  const [enabled, setEnabled] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Remote server provider state
  const [serverStatus, setServerStatus] = useState<SyncServerStatus>(DEFAULT_SERVER_STATUS)
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [serverUsername, setServerUsername] = useState('')
  const [serverPassword, setServerPassword] = useState('')
  const [deviceNameInput, setDeviceNameInput] = useState('')
  const [registering, setRegistering] = useState(false)
  const [serverBusy, setServerBusy] = useState(false)
  const [conflict, setConflict] = useState<{ currentVersion: number; updatedAt: number; deviceId: string; deviceName: string } | null>(null)

  useEffect(() => {
    loadSettings()
    loadServerStatus()
  }, [])

  const loadSettings = async () => {
    try {
      const result = await invoke('sync:load-settings')
      setEnabled(result.enabled)
      setFolder(result.folder)
      if (result.enabled) setProvider('local')
    } catch {}
  }

  const loadServerStatus = async () => {
    try {
      const status = await invoke('syncServer:status')
      setServerStatus(status)
      if (status.serverUrl) setServerUrlInput(status.serverUrl)
      if (status.username) setServerUsername(status.username)
      if (status.deviceName) setDeviceNameInput(status.deviceName)
      if (status.loggedIn) setProvider('server')
    } catch {}
  }

  // ─── Local folder provider ────────────────────────────

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

  const formatLastSync = (time: number) => {
    if (!time) return t('never')
    const diff = Date.now() - time
    if (diff < 60000) return t('just_now')
    if (diff < 3600000) return t('minutes_ago', { n: Math.floor(diff / 60000) })
    return new Date(time).toLocaleTimeString()
  }

  // ─── Remote server provider ───────────────────────────

  const handleConfigureServer = async () => {
    if (!serverUrlInput) return
    setServerBusy(true)
    try {
      await invoke('syncServer:configure', serverUrlInput)
      await loadServerStatus()
    } catch {
      addToast(t('sync_server_configure_failed'), 'error')
    } finally {
      setServerBusy(false)
    }
  }

  const handleRegister = async () => {
    if (!serverUsername || !serverPassword) return
    setServerBusy(true)
    try {
      const result = await invoke('syncServer:register', serverUsername, serverPassword)
      if (result.success) {
        addToast(t('sync_server_register_success'), 'success')
        setRegistering(false)
      } else {
        addToast(result.error || t('sync_server_configure_failed'), 'error')
      }
    } catch {
      addToast(t('sync_server_configure_failed'), 'error')
    } finally {
      setServerBusy(false)
    }
  }

  const handleLogin = async () => {
    if (!serverUsername || !serverPassword) return
    setServerBusy(true)
    try {
      const result = await invoke('syncServer:login', serverUsername, serverPassword, deviceNameInput || 'My Device')
      if (result.success) {
        await setSyncPasswordEncrypted(serverPassword)
        addToast(t('sync_server_login_success'), 'success')
        await loadServerStatus()
        if (enabled) await invoke('sync:disable').then(() => { setEnabled(false); setFolder(null) }).catch(() => {})
      } else {
        addToast(result.error || t('sync_server_configure_failed'), 'error')
      }
    } catch {
      addToast(t('sync_server_configure_failed'), 'error')
    } finally {
      setServerBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      await invoke('syncServer:logout')
      await loadServerStatus()
      addToast(t('sync_server_logout_success'), 'success')
    } catch {
      addToast(t('sync_server_configure_failed'), 'error')
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm(t('sync_server_confirm_delete_account'))) return
    setServerBusy(true)
    try {
      const result = await invoke('syncServer:delete-account')
      if (result.success) {
        addToast(t('sync_server_delete_account_success'), 'success')
        setServerPassword('')
        await loadServerStatus()
      } else {
        addToast(result.error || t('sync_server_configure_failed'), 'error')
      }
    } catch {
      addToast(t('sync_server_configure_failed'), 'error')
    } finally {
      setServerBusy(false)
    }
  }

  const handlePush = async (forceVersion?: number) => {
    if (!serverPassword) {
      addToast(t('enter_sync_password_first'), 'warning')
      return
    }
    setServerBusy(true)
    try {
      const result = await invoke('syncServer:push', serverPassword, forceVersion)
      if (result.success) {
        addToast(t('sync_server_push_success'), 'success')
        setConflict(null)
        await loadServerStatus()
      } else if (result.conflict) {
        setConflict(result.conflict)
      } else {
        addToast(result.error || t('sync_failed'), 'error')
      }
    } catch {
      addToast(t('sync_failed'), 'error')
    } finally {
      setServerBusy(false)
    }
  }

  const handlePull = async () => {
    if (!serverPassword) {
      addToast(t('enter_sync_password_first'), 'warning')
      return
    }
    setServerBusy(true)
    try {
      const result = await invoke('syncServer:pull', serverPassword)
      if (result.success) {
        addToast(result.imported ? t('sync_server_pull_success_imported') : t('sync_server_pull_success_nochange'), 'success')
        setConflict(null)
        await loadServerStatus()
      } else {
        addToast(result.error || t('sync_failed'), 'error')
      }
    } catch {
      addToast(t('sync_failed'), 'error')
    } finally {
      setServerBusy(false)
    }
  }

  const handleSelectProvider = async (target: Provider) => {
    if (target === provider) return
    if (target === 'server' && enabled) {
      try {
        await invoke('sync:disable')
        setEnabled(false)
        setFolder(null)
      } catch {}
    }
    if (target === 'local' && serverStatus.loggedIn) {
      try {
        await invoke('syncServer:logout')
        await loadServerStatus()
      } catch {}
    }
    setProvider(target)
  }

  return (
    <div className="space-y-4">
      {/* Provider toggle — mutually exclusive */}
      <div className="flex rounded-lg border border-vault-border p-1 bg-vault-bg">
        <button
          type="button"
          onClick={() => handleSelectProvider('local')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
            provider === 'local' ? 'bg-vault-surface text-vault-text shadow-sm' : 'text-vault-text-secondary hover:text-vault-text'
          )}
        >
          <FolderOpen size={14} />
          {t('sync_provider_local')}
        </button>
        <button
          type="button"
          onClick={() => handleSelectProvider('server')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
            provider === 'server' ? 'bg-vault-surface text-vault-text shadow-sm' : 'text-vault-text-secondary hover:text-vault-text'
          )}
        >
          <Server size={14} />
          {t('sync_provider_server')}
        </button>
      </div>

      {provider === 'local' ? (
        <>
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
                {t('last_sync')}: {formatLastSync(lastSyncTime)}
              </span>
            )}
          </div>

          {!enabled && (
            <Button variant="secondary" onClick={handleSelectFolder} disabled={loading} className="w-full">
              <FolderOpen size={16} className="mr-2" />
              {loading ? t('selecting') : t('select_sync_folder')}
            </Button>
          )}

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
        </>
      ) : (
        <>
          {/* Status */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-vault-bg border border-vault-border">
            {serverStatus.loggedIn ? (
              <Cloud size={20} className="text-vault-success" />
            ) : (
              <CloudOff size={20} className="text-vault-text-secondary" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-vault-text">
                {serverStatus.loggedIn
                  ? t('sync_server_logged_in_as', { username: serverStatus.username || '' })
                  : serverStatus.configured
                    ? t('sync_server_configured')
                    : t('sync_disabled_label')}
              </p>
              {serverStatus.serverUrl && (
                <p className="text-xs text-vault-text-secondary truncate">{serverStatus.serverUrl}</p>
              )}
            </div>
            {serverStatus.loggedIn && (
              <span className="text-xs text-vault-text-secondary">
                {t('last_sync')}: {formatLastSync(serverStatus.lastSyncTime)}
              </span>
            )}
          </div>

          {!serverStatus.configured && (
            <>
              <Input
                label={t('sync_server_url')}
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder={t('sync_server_url_placeholder')}
              />
              <Button variant="secondary" onClick={handleConfigureServer} disabled={serverBusy || !serverUrlInput} className="w-full">
                {t('sync_server_configure')}
              </Button>
            </>
          )}

          {serverStatus.configured && !serverStatus.loggedIn && (
            <>
              <Input
                label={t('sync_server_username')}
                value={serverUsername}
                onChange={(e) => setServerUsername(e.target.value)}
              />
              <Input
                label={t('sync_password')}
                type="password"
                value={serverPassword}
                onChange={(e) => setServerPassword(e.target.value)}
                placeholder={t('enter_sync_password')}
                showPasswordToggle
              />
              {!registering && (
                <Input
                  label={t('sync_server_device_name')}
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value)}
                />
              )}
              <p className="text-[10px] text-vault-text-secondary">
                {t('sync_password_hint')}
              </p>
              {registering ? (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={handleRegister} disabled={serverBusy || !serverUsername || !serverPassword} className="flex-1">
                    {t('sync_server_register')}
                  </Button>
                  <Button variant="ghost" onClick={() => setRegistering(false)} className="flex-1">
                    {t('sync_server_have_account')}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={handleLogin} disabled={serverBusy || !serverUsername || !serverPassword} className="flex-1">
                    {t('sync_server_login')}
                  </Button>
                  <Button variant="ghost" onClick={() => setRegistering(true)} className="flex-1">
                    {t('sync_server_no_account_yet')}
                  </Button>
                </div>
              )}
            </>
          )}

          {serverStatus.loggedIn && (
            <>
              <Input
                label={t('sync_password')}
                type="password"
                value={serverPassword}
                onChange={(e) => setServerPassword(e.target.value)}
                placeholder={t('enter_sync_password')}
                showPasswordToggle
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handlePush()} disabled={serverBusy || !serverPassword} className="flex-1">
                  <Upload size={16} className="mr-2" />
                  {t('sync_server_push')}
                </Button>
                <Button variant="secondary" onClick={handlePull} disabled={serverBusy || !serverPassword} className="flex-1">
                  <Download size={16} className="mr-2" />
                  {t('sync_server_pull')}
                </Button>
              </div>
              <Button variant="danger" onClick={handleLogout} className="w-full">
                <LogOut size={16} className="mr-2" />
                {t('sync_server_logout')}
              </Button>
              <Button variant="ghost" onClick={handleDeleteAccount} disabled={serverBusy} className="w-full text-vault-danger">
                <Trash2 size={16} className="mr-2" />
                {t('sync_server_delete_account')}
              </Button>
            </>
          )}
        </>
      )}

      <Modal open={!!conflict} onClose={() => setConflict(null)} title={t('sync_server_conflict_title')}>
        {conflict && (
          <div className="space-y-4">
            <p className="text-sm text-vault-text-secondary">
              {t('sync_server_conflict_message', {
                device: conflict.deviceName,
                time: new Date(conflict.updatedAt).toLocaleString(),
              })}
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="danger" onClick={() => handlePush(conflict.currentVersion)} disabled={serverBusy}>
                {t('sync_server_conflict_overwrite')}
              </Button>
              <Button variant="secondary" onClick={handlePull} disabled={serverBusy}>
                {t('sync_server_conflict_download')}
              </Button>
              <Button variant="ghost" onClick={() => setConflict(null)}>
                {t('sync_server_conflict_cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
