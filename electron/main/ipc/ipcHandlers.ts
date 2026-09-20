import { ipcMain } from 'electron'
import { ERRORS } from '../../../shared/errors'
import * as vaultService from '../services/vault.service'
import * as entriesService from '../services/entries.service'
import * as attachmentsService from '../services/attachments.service'
import * as clipboardService from '../services/clipboard.service'
import { generatePassword, generateUsername, generatePassphrase } from '../services/password-gen.service'
import { checkBreach } from '../services/breach-check.service'
import { checkAllPasswordsForBreaches } from '../services/breach-monitor.service'
import * as backupService from '../services/backup.service'
import { analyzePasswordHealth } from '../services/health.service'
import * as syncService from '../services/sync.service'
import * as syncServerService from '../services/syncServer.service'
import { sendBackup, testTelegramConnection, getTelegramChatIdFromToken, saveTelegramConfig, sendBreachNotification } from '../services/email.service'
import { saveSecret, getSecret } from '../services/secretStorage'
import { getDatabase } from '../db/connection'
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories } from '../db/queries/categories.queries'
import { checkIntegrity } from '../integrity'
import { handleImportCSV, handleImportJSON, handleExportCSV, handleExportJSON, handleCheckDuplicatePassword } from './importExport.handlers'
import { handleImportPanicBackup } from './backupImport.handlers'
import { loadGlobalShortcut, registerGlobalShortcuts, setGlobalShortcut, getCurrentShortcut } from './shortcut.handlers'

const handlers: Record<string, (...args: any[]) => any> = {
  // Vault
  'vault:status': () => vaultService.getVaultStatus(),
  'vault:setup': (_: unknown, masterPassword: string, alarmPassword?: string, displayName?: string) => vaultService.setupVault(masterPassword, alarmPassword, displayName),
  'vault:create': (_: unknown, masterPassword: string, displayName: string) => vaultService.setupVault(masterPassword, undefined, displayName),
  'vault:unlock': (_: unknown, masterPassword: string, totpCode?: string, vaultId?: number) => vaultService.unlockVault(masterPassword, totpCode, vaultId),
  'vault:lock': () => vaultService.lockVault(),
  'vault:reset-timer': () => vaultService.resetAutoLockTimer(),
  'vault:switch': (_: unknown, vaultId: number) => vaultService.switchVault(vaultId),
  'vault:change-master-password': (_: unknown, oldPwd: string, newPwd: string, totpCode?: string) => vaultService.changeMasterPassword(oldPwd, newPwd, totpCode),
  'vault:enable-totp': () => {
    const result = vaultService.enableTOTP()
    if ('error' in result) throw new Error(result.error)
    return result
  },
  'vault:verify-totp': (_: unknown, code: string) => vaultService.verifyAndSaveTOTP(code),
  'vault:disable-totp': (_: unknown, totpCode: string) => vaultService.disableTOTP(totpCode),
  'vault:setup-alarm': async (_: unknown, alarmPassword: string, backupEmail?: string) => {
    const result = await vaultService.setupAlarmPassword(alarmPassword)
    if (result.success && backupEmail) {
      const db = await getDatabase()
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('alarm_backup_email', ?)", [backupEmail])
    }
    return result
  },
  'vault:change-alarm': (_: unknown, oldAlarm: string, newAlarm: string) => vaultService.changeAlarmPassword(oldAlarm, newAlarm),
  'vault:remove-alarm': () => vaultService.removeAlarmPassword(),

  'vault:verify-password': async (_: unknown, password: string) => {
    try {
      return await vaultService.verifyPassword(password)
    } catch {
      return false
    }
  },
  'vault:get-kdf-salt': async (_: unknown, vaultId: number) => {
    const db = await getDatabase()
    const result = db.exec('SELECT kdf_salt FROM vault WHERE id = ?', [vaultId])
    if (result.length === 0 || result[0].values.length === 0) return null
    return result[0].values[0][0] as string
  },

  // Entries
  'entries:list': (_: unknown, filters?: any) => {
    // Validate filters structure
    if (filters && typeof filters === 'object') {
      const allowedKeys = ['category_id', 'is_favorite', 'entry_type', 'search']
      for (const key of Object.keys(filters)) {
        if (!allowedKeys.includes(key)) delete filters[key]
      }
    }
    return entriesService.listEntries(filters)
  },
  'entries:get': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.getEntry(id)
  },
  'entries:create': (_: unknown, data: any) => {
    if (!data || typeof data !== 'object' || !data.entry_type) throw new Error('Invalid entry data')
    const allowedTypes = ['login', 'secure_note', 'card', 'identity', 'passkey']
    if (!allowedTypes.includes(data.entry_type)) throw new Error('Invalid entry type')
    return entriesService.createEntry(data)
  },
  'entries:update': (_: unknown, id: number, data: any) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    if (!data || typeof data !== 'object') throw new Error('Invalid update data')
    return entriesService.updateEntry(id, data)
  },
  'entries:delete': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.deleteEntryById(id)
  },
  'entries:restore': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.restoreEntry(id)
  },
  'entries:permanent-delete': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.permanentDeleteEntry(id)
  },
  'entries:deleted': () => entriesService.getDeletedEntries(),
  'entries:cleanup-old': () => entriesService.cleanupOldDeletedEntries(),
  'entries:search': (_: unknown, query: string, filters?: any) => {
    if (typeof query !== 'string' || query.length > 1000) throw new Error('Invalid search query')
    if (filters && typeof filters === 'object') {
      const allowedKeys = ['category_id', 'is_favorite', 'entry_type']
      for (const key of Object.keys(filters)) {
        if (!allowedKeys.includes(key)) delete filters[key]
      }
    }
    return entriesService.searchEntries(query, filters)
  },
  'entries:toggle-favorite': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.toggleFavoriteEntry(id)
  },
  'entries:get-history': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.getEntryHistoryList(id)
  },
  'entries:get-decrypted-history': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.getDecryptedHistory(id)
  },
  'entries:get-totp': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.getEntryTOTP(id)
  },

  // Alarm mode — bypass key check
  'entries:force-list': () => {
    if (!vaultService.isAlarmMode()) throw new Error('Not in alarm mode')
    return entriesService.forceListEntries()
  },
  'entries:force-delete': (_: unknown, id: number) => {
    if (!vaultService.isAlarmMode()) throw new Error('Not in alarm mode')
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid entry ID')
    return entriesService.forcePermanentDeleteEntry(id)
  },
  'entries:panic-backup': () => {
    if (!vaultService.isAlarmMode()) throw new Error('Not in alarm mode')
    return entriesService.getPanicBackupEntries()
  },
  'entries:complete-panic': () => entriesService.completePanic(),

  // Attachments
  'attachments:list': (_: unknown, entryId: number) => {
    if (typeof entryId !== 'number' || entryId <= 0 || entryId > 2147483647) throw new Error('Invalid entry ID')
    return attachmentsService.listAttachments(entryId)
  },
  'attachments:add': (_: unknown, entryId: number, filename: string, mimeType: string, data: Uint8Array) => {
    if (typeof entryId !== 'number' || entryId <= 0 || entryId > 2147483647) throw new Error('Invalid entry ID')
    if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255) throw new Error('Invalid filename')
    if (typeof mimeType !== 'string' || mimeType.length > 255) throw new Error('Invalid MIME type')
    if (!(data instanceof Uint8Array)) throw new Error('Invalid file data')
    return attachmentsService.addAttachment(entryId, filename, mimeType, Buffer.from(data))
  },
  'attachments:get': async (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid attachment ID')
    const result = await attachmentsService.getAttachmentData(id)
    if (!result) return null
    return { meta: result.meta, data: new Uint8Array(result.data) }
  },
  'attachments:delete': (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid attachment ID')
    return attachmentsService.deleteAttachmentById(id)
  },

  // Email / Telegram
  'email:send-backup': (_: unknown, backupData: string) => sendBackup(backupData),
  'email:test-telegram': (_: unknown, token: string) => testTelegramConnection(token),
  'email:get-chat-id': (_: unknown, token: string) => getTelegramChatIdFromToken(token),
  'email:save-telegram': (_: unknown, token: string, chatId: string) => saveTelegramConfig(token, chatId),
  'email:send-breach-notification': (_: unknown, entryTitle: string, breachCount: number) => sendBreachNotification(entryTitle, breachCount),

  // Password
  'password:generate': (_: unknown, options: any) => {
    // Validate options structure
    if (options && typeof options === 'object') {
      if (typeof options.length === 'number') {
        options.length = Math.max(8, Math.min(128, Math.floor(options.length)))
      }
      for (const key of ['uppercase', 'lowercase', 'numbers', 'symbols']) {
        if (key in options) options[key] = !!options[key]
      }
    }
    return generatePassword(options)
  },
  'password:check-breach': (_: unknown, password: string) => checkBreach(password),
  'password:check-duplicate': (_: unknown, password: string) => handleCheckDuplicatePassword(password),
  'password:check-all-breaches': () => checkAllPasswordsForBreaches(),

  // Categories
  'categories:list': async () => {
    const db = await getDatabase()
    return getCategories(db)
  },
  'categories:create': async (_: unknown, data: any) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid category data')
    if (typeof data.name !== 'string' || data.name.trim().length === 0) throw new Error('Category name required')
    if (data.name.length > 100) throw new Error('Category name too long')
    const db = await getDatabase()
    return createCategory(db, data.name.trim(), data.icon || 'folder', data.color || '#6366f1')
  },
  'categories:update': async (_: unknown, id: number, data: any) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid category ID')
    if (!data || typeof data !== 'object') throw new Error('Invalid category data')
    const db = await getDatabase()
    return updateCategory(db, id, data)
  },
  'categories:delete': async (_: unknown, id: number) => {
    if (typeof id !== 'number' || id <= 0 || id > 2147483647) throw new Error('Invalid category ID')
    const db = await getDatabase()
    return deleteCategory(db, id)
  },
  'categories:reorder': async (_: unknown, ids: number[]) => {
    const db = await getDatabase()
    return reorderCategories(db, ids)
  },

  // Clipboard
  'clipboard:copy': (_: unknown, text: string, ttl?: number) => clipboardService.copyToClipboard(text, ttl),
  'clipboard:clear': () => clipboardService.clearClipboard(),

  // Settings
  'settings:get': async (_: unknown, key: string) => {
    const db = await getDatabase()
    const result = db.exec('SELECT value FROM settings WHERE key = ?', [key])
    if (result.length === 0 || result[0].values.length === 0) return null
    return result[0].values[0][0] as string
  },
  'settings:set': async (_: unknown, key: string, value: string) => {
    const ALLOWED_SETTINGS = new Set([
      'auto_lock_ms', 'clipboard_ttl_ms', 'theme', 'default_view', 'font_size',
      'show_icons', 'global_shortcut', 'totp_enabled', 'alarm_enabled',
      'default_vault_id', 'last_active_vault'
    ])
    if (!ALLOWED_SETTINGS.has(key)) throw new Error('Key not allowed')
    const db = await getDatabase()
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  },
  'settings:set-secure': async (_: unknown, key: string, value: string) => {
    await saveSecret(key, value)
  },
  'settings:get-secure': async (_: unknown, key: string) => {
    return getSecret(key)
  },

  // Backup
  'backup:export': (_: unknown, backupPassword: string) => backupService.exportEncryptedBackup(backupPassword),
  'backup:import': (_: unknown, backupPassword: string) => backupService.importEncryptedBackup(backupPassword),
  'backup:import-panic': (_: unknown, backupPassword: string, masterPassword?: string) => handleImportPanicBackup(backupPassword, masterPassword),

  // Health
  'health:analyze': () => analyzePasswordHealth(),

  // Generators
  'password:generate-username': () => generateUsername(),
  'password:generate-passphrase': (_: unknown, wordCount?: number) => generatePassphrase(wordCount),

  // Sync
  'sync:get-status': () => syncService.getSyncStatus(),
  'sync:select-folder': () => syncService.selectSyncFolder(),
  'sync:set-password': (_: unknown, password: string) => syncService.setSyncPassword(password),
  'sync:now': () => syncService.syncNow(),
  'sync:disable': () => syncService.disableSync(),
  'sync:load-settings': () => syncService.loadSyncSettings(),

  // Sync — remote server
  'syncServer:configure': (_: unknown, url: string) => syncServerService.configureServer(url),
  'syncServer:register': (_: unknown, username: string, syncPassword: string) =>
    syncServerService.registerAccount(username, syncPassword),
  'syncServer:login': (_: unknown, username: string, syncPassword: string, deviceName: string) =>
    syncServerService.loginAccount(username, syncPassword, deviceName),
  'syncServer:logout': () => syncServerService.logoutAccount(),
  'syncServer:push': (_: unknown, syncPassword: string, forceVersion?: number) =>
    syncServerService.pushVault(syncPassword, forceVersion),
  'syncServer:pull': (_: unknown, syncPassword: string) => syncServerService.pullVault(syncPassword),
  'syncServer:status': () => syncServerService.getSyncServerStatus(),
  'syncServer:delete-account': () => syncServerService.deleteAccount(),
  'syncServer:list-sessions': () => syncServerService.listSessions(),
  'syncServer:revoke-session': (_: unknown, deviceId: string) => syncServerService.revokeSession(deviceId),

  // Global Shortcut
  'shortcut:get': async () => {
    await loadGlobalShortcut()
    return getCurrentShortcut()
  },
  'shortcut:set': (_: unknown, shortcut: string) => setGlobalShortcut(shortcut),

  // Integrity check
  'integrity:check': () => checkIntegrity(),

  // Passkey management
  'passkey:save': async (_: unknown, credential: any) => {
    const { savePasskey, listPasskeys } = await import('../services/passkeyStorage')
    const existing = await listPasskeys()
    if (existing.some(c => c.id === credential.id)) return { success: true }
    await savePasskey(credential)
    return { success: true }
  },
  'passkey:get': async (_: unknown, credentialId: string) => {
    const { getPasskey } = await import('../services/passkeyStorage')
    return getPasskey(credentialId)
  },
  'passkey:list': async () => {
    const { listPasskeys } = await import('../services/passkeyStorage')
    return listPasskeys()
  },
  'passkey:delete': async (_: unknown, credentialId: string) => {
    const { deletePasskey } = await import('../services/passkeyStorage')
    return deletePasskey(credentialId)
  },
  'passkey:update-counter': async (_: unknown, credentialId: string, counter: number) => {
    const { updatePasskeyCounter } = await import('../services/passkeyStorage')
    return updatePasskeyCounter(credentialId, counter)
  },

  // API Server
  'api:start': async () => {
    const { startApiServer } = require('../services/api.service')
    return startApiServer()
  },
  'api:stop': () => {
    const { stopApiServer } = require('../services/api.service')
    stopApiServer()
    return { success: true }
  },
  'api:get-key': () => {
    const { getApiKey } = require('../services/api.service')
    return { apiKey: getApiKey() }
  },

  // Import CSV
  'import:csv': () => handleImportCSV(),

  // Import JSON
  'import:json': () => handleImportJSON(),

  // Export CSV
  'export:csv': (_: unknown, entryIds?: number[]) => handleExportCSV(entryIds),

  // Export JSON
  'export:json': (_: unknown, entryIds?: number[]) => handleExportJSON(entryIds),
}

export function registerIPC(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }
}

export function unregisterIPC(): void {
  for (const channel of Object.keys(handlers)) {
    ipcMain.removeHandler(channel)
  }
}

export async function initShortcuts(): Promise<void> {
  await loadGlobalShortcut()
  registerGlobalShortcuts()
}
