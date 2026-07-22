import { ipcMain, dialog, globalShortcut } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { ERRORS } from '../../../shared/errors'
import * as vaultService from '../services/vault.service'
import * as entriesService from '../services/entries.service'
import * as clipboardService from '../services/clipboard.service'
import * as disposableEmailService from '../services/disposable-email.service'
import { generatePassword, generateUsername, generatePassphrase } from '../services/password-gen.service'
import { checkBreach } from '../services/breach-check.service'
import { checkAllPasswordsForBreaches } from '../services/breach-monitor.service'
import * as backupService from '../services/backup.service'
import { analyzePasswordHealth } from '../services/health.service'
import * as syncService from '../services/sync.service'
import { sendBackup, testTelegramConnection, getTelegramChatIdFromToken, saveTelegramConfig, sendBreachNotification } from '../services/email.service'
import { saveSecret, getSecret } from '../services/secretStorage'
import { getDatabase } from '../db/connection'
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories } from '../db/queries/categories.queries'
import { checkIntegrity } from '../integrity'
import { getActiveVaultId } from '../services/vault.service'
import { getWindow, toggleWindow } from '../utils/window'
import { mapColumns, mapEntryType, detectCSVSource } from '../../../shared/importMapper'

let currentShortcut: string = 'CommandOrControl+Shift+Space'

async function loadGlobalShortcut(): Promise<void> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = 'global_shortcut'")
    if (result.length > 0 && result[0].values.length > 0) {
      currentShortcut = result[0].values[0][0] as string
    }
  } catch {}
}

function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  const registered = globalShortcut.register(currentShortcut, () => {
    toggleWindow()
  })
  if (!registered) {
    console.warn(`Failed to register global shortcut: ${currentShortcut}`)
  }
}

async function setGlobalShortcut(shortcut: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!shortcut || !shortcut.includes('+')) {
      return { success: false, error: ERRORS.SHORTCUT_INVALID_FORMAT }
    }
    globalShortcut.unregisterAll()
    const registered = globalShortcut.register(shortcut, () => {
      toggleWindow()
    })
    if (!registered) {
      globalShortcut.register(currentShortcut, () => {
        toggleWindow()
      })
      return { success: false, error: ERRORS.SHORTCUT_REGISTER_FAILED }
    }
    currentShortcut = shortcut
    const db = await getDatabase()
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('global_shortcut', ?)", [shortcut])
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

const handlers: Record<string, (...args: any[]) => any> = {
  // Vault
  'vault:status': () => vaultService.getVaultStatus(),
  'vault:setup': (_: unknown, masterPassword: string, alarmPassword?: string, displayName?: string) => vaultService.setupVault(masterPassword, alarmPassword, displayName),
  'vault:create': (_: unknown, masterPassword: string, displayName: string) => vaultService.setupVault(masterPassword, undefined, displayName),
  'vault:unlock': (_: unknown, masterPassword: string, totpCode?: string, vaultId?: number) => vaultService.unlockVault(masterPassword, totpCode, vaultId),
  'vault:lock': () => vaultService.lockVault(),
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

  // Email / Telegram
  'email:send-backup': (_: unknown, backupData: string) => sendBackup(backupData),
  'email:test-telegram': (_: unknown, token: string) => testTelegramConnection(token),
  'email:get-chat-id': (_: unknown, token: string) => getTelegramChatIdFromToken(token),
  'email:save-telegram': (_: unknown, token: string, chatId: string) => saveTelegramConfig(token, chatId),
  'email:send-breach-notification': (_: unknown, entryTitle: string, breachCount: number) => sendBreachNotification(entryTitle, breachCount),

  // Password
  'password:generate': (_: unknown, options: any) => generatePassword(options),
  'password:check-breach': (_: unknown, password: string) => checkBreach(password),
  'password:check-duplicate': (_: unknown, password: string) => checkDuplicatePassword(password),
  'password:check-all-breaches': () => checkAllPasswordsForBreaches(),

  // Categories
  'categories:list': async () => {
    const db = await getDatabase()
    return getCategories(db)
  },
  'categories:create': async (_: unknown, data: any) => {
    const db = await getDatabase()
    return createCategory(db, data.name, data.icon, data.color)
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

  // Disposable Emails
  'disposable:create': () => disposableEmailService.createDisposableEmailAddress(),
  'disposable:list': () => disposableEmailService.listDisposableEmails(),
  'disposable:messages': (_: unknown, emailId: number) => {
    if (typeof emailId !== 'number' || emailId <= 0) throw new Error('Invalid email ID')
    return disposableEmailService.getDisposableEmailMessages(emailId)
  },
  'disposable:message': (_: unknown, emailId: number, messageId: string) => {
    if (typeof emailId !== 'number' || emailId <= 0) throw new Error('Invalid email ID')
    if (typeof messageId !== 'string' || messageId.length > 100) throw new Error('Invalid message ID')
    return disposableEmailService.getDisposableEmailMessage(emailId, messageId)
  },
  'disposable:delete-message': (_: unknown, emailId: number, messageId: string) => {
    if (typeof emailId !== 'number' || emailId <= 0) throw new Error('Invalid email ID')
    if (typeof messageId !== 'string' || messageId.length > 100) throw new Error('Invalid message ID')
    return disposableEmailService.deleteDisposableEmailMessage(emailId, messageId)
  },
  'disposable:delete-account': (_: unknown, emailId: number) => {
    if (typeof emailId !== 'number' || emailId <= 0) throw new Error('Invalid email ID')
    return disposableEmailService.deleteDisposableEmailAccount(emailId)
  },

  // Backup
  'backup:export': (_: unknown, backupPassword: string) => backupService.exportEncryptedBackup(backupPassword),
  'backup:import': (_: unknown, backupPassword: string) => backupService.importEncryptedBackup(backupPassword),
  'backup:import-panic': async (_: unknown, backupPassword: string, masterPassword?: string) => {
    const win = getWindow()
    if (!win) return { success: false, error: ERRORS.BACKUP_NO_WINDOW }

    const result = await dialog.showOpenDialog(win, {
      title: 'Import Panic Backup',
      filters: [{ name: 'Encrypted Backup', extensions: ['enc'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: ERRORS.BACKUP_CANCELLED }
    }
    const filePath = result.filePaths[0]

    try {
      const { pbkdf2, createDecipheriv } = await import('crypto')
      const { deriveKey, splitDerivedKey } = await import('../crypto/keyderivation')
      const { decryptJSON } = await import('../crypto/encryption')

      const fileContent = readFileSync(filePath, 'utf-8').trim()
      const combined = Buffer.from(fileContent, 'base64')

      // salt(32) + iv(12) + ciphertext+authTag
      const salt = combined.subarray(0, 32)
      const iv = combined.subarray(32, 44)
      const encryptedData = combined.subarray(44)

      const key = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(backupPassword, salt, 600000, 32, 'sha256', (err, derivedKey) => {
          if (err) reject(err)
          else resolve(derivedKey)
        })
      })
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
      decipher.setAuthTag(encryptedData.subarray(encryptedData.length - 16))
      const decrypted = Buffer.concat([
        decipher.update(encryptedData.subarray(0, encryptedData.length - 16)),
        decipher.final(),
      ]).toString('utf-8')

      const backup = JSON.parse(decrypted)
      if (backup.format !== 'ciphervault-panic-backup') {
        return { success: false, error: ERRORS.BACKUP_FORMAT_INVALID }
      }

      let imported = 0
      let skipped = 0
      const errors: string[] = []

      // v2.0: entries are encrypted with original vault key, need master password to restore
      if (backup.version === '2.0') {
        if (!masterPassword) {
          return { success: false, error: 'Мастер-пароль необходим для восстановления зашифрованных записей' }
        }
        if (!backup.kdf_salt) {
          return { success: false, error: 'Бэкап не содержит kdf_salt. Невозможно восстановить записи.' }
        }

        // Derive original encryption key from master password + backup's kdf_salt
        const originalSalt = Buffer.from(backup.kdf_salt, 'hex')
        const originalKey = await deriveKey(masterPassword, originalSalt)
        const { encryptionKey: originalEncKey } = splitDerivedKey(originalKey)

        for (const entry of backup.entries) {
          try {
            if (!entry.display_title) { skipped++; continue }

            // Decrypt entry with original master key
            const decryptedEntry = decryptJSON<Record<string, string>>(
              { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
              originalEncKey
            )

            // Re-encrypt with current vault key via createEntry
            await entriesService.createEntry({
              entry_type: entry.entry_type || 'login',
              title: entry.display_title || '',
              username: decryptedEntry.username || '',
              password: decryptedEntry.password || '',
              url: decryptedEntry.url || '',
              notes: decryptedEntry.notes || '',
              totp_secret: decryptedEntry.totp_secret || '',
              card_number: decryptedEntry.card_number || undefined,
              card_holder: decryptedEntry.card_holder || undefined,
              card_expiry: decryptedEntry.card_expiry || undefined,
              card_cvv: decryptedEntry.card_cvv || undefined,
              identity_first_name: decryptedEntry.identity_first_name || undefined,
              identity_last_name: decryptedEntry.identity_last_name || undefined,
              identity_phone: decryptedEntry.identity_phone || undefined,
              identity_email: decryptedEntry.identity_email || undefined,
              identity_address: decryptedEntry.identity_address || undefined,
            })
            imported++
          } catch (e: any) {
            errors.push(`Entry: ${e.message}`)
            skipped++
          }
        }
      } else {
        // v1.0: entries have decrypted fields (legacy format)
        for (const entry of backup.entries) {
          try {
            const entryType = entry.entry_type || 'login'
            const title = entry.display_title || entry.title || ''
            if (!title) { skipped++; continue }

            await entriesService.createEntry({
              entry_type: entryType,
              title,
              username: entry.username || '',
              password: entry.password || '',
              url: entry.url || '',
              notes: entry.notes || '',
              totp_secret: entry.totp_secret || '',
              card_number: entry.card_number || undefined,
              card_holder: entry.card_holder || undefined,
              card_expiry: entry.card_expiry || undefined,
              card_cvv: entry.card_cvv || undefined,
              identity_first_name: entry.identity_first_name || undefined,
              identity_last_name: entry.identity_last_name || undefined,
              identity_phone: entry.identity_phone || undefined,
              identity_email: entry.identity_email || undefined,
              identity_address: entry.identity_address || undefined,
            })
            imported++
          } catch (e: any) {
            errors.push(`Entry: ${e.message}`)
            skipped++
          }
        }
      }

      return { success: true, imported, skipped, errors }
    } catch (e: any) {
      return { success: false, error: ERRORS.BACKUP_DECRYPT_FAILED }
    }
  },

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

  // Global Shortcut
  'shortcut:get': async () => {
    await loadGlobalShortcut()
    return currentShortcut
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
  'import:csv': async (_: unknown) => {
    const win = getWindow()
    if (!win) return { imported: 0, skipped: 0, errors: ['No window available'] }
    const openResult = await dialog.showOpenDialog(win, {
      title: 'Import CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    if (openResult.canceled || !openResult.filePaths[0]) {
      return { imported: 0, skipped: 0, errors: ['Cancelled'] }
    }
    const filePath = openResult.filePaths[0]

    try {
      // Strip BOM if present
      let content = readFileSync(filePath, 'utf-8')
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1)
      }
      // Handle CSV files with quoted fields containing newlines
      const lines: string[] = []
      let currentLine = ''
      let inQuotes = false
      for (const char of content) {
        if (char === '"') {
          inQuotes = !inQuotes
          currentLine += char
        } else if (char === '\r') {
          // Skip \r (handles \r\n line endings)
        } else if (char === '\n' && !inQuotes) {
          if (currentLine.trim()) {
            lines.push(currentLine)
          }
          currentLine = ''
        } else {
          currentLine += char
        }
      }
      if (currentLine.trim()) {
        lines.push(currentLine)
      }
      // Parse CSV header — universal mapper supports all password managers
      const headerLine = lines[0]
      const colMap = mapColumns(headerLine)
      const source = detectCSVSource(headerLine)
      let imported = 0
      let skipped = 0
      const errors: string[] = []
      const vaultId = getActiveVaultId()

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCSVLine(lines[i])
          const title = colMap.nameIdx >= 0 ? stripQuotes(values[colMap.nameIdx]) : `Import ${i}`
          if (!title) { skipped++; continue }

          const entryType = mapEntryType(
            colMap.typeIdx >= 0 ? values[colMap.typeIdx] : '',
            source
          )

          // Skip duplicates
          if (await isDuplicateEntry(title, colMap.userIdx >= 0 ? values[colMap.userIdx] : '', vaultId)) {
            skipped++
            continue
          }

          await entriesService.createEntry({
            entry_type: entryType as any,
            title,
            username: stripQuotes(colMap.userIdx >= 0 ? values[colMap.userIdx] : ''),
            password: stripQuotes(colMap.passIdx >= 0 ? values[colMap.passIdx] : ''),
            url: stripQuotes(colMap.urlIdx >= 0 ? values[colMap.urlIdx] : ''),
            notes: stripQuotes(colMap.notesIdx >= 0 ? values[colMap.notesIdx] : ''),
            totp_secret: stripQuotes(colMap.totpIdx >= 0 ? values[colMap.totpIdx] : ''),
            card_number: colMap.cardNumIdx >= 0 ? stripQuotes(values[colMap.cardNumIdx]) : undefined,
            card_holder: colMap.cardHolderIdx >= 0 ? stripQuotes(values[colMap.cardHolderIdx]) : undefined,
            card_expiry: colMap.cardExpiryIdx >= 0 ? stripQuotes(values[colMap.cardExpiryIdx]) : undefined,
            card_cvv: colMap.cardCvvIdx >= 0 ? stripQuotes(values[colMap.cardCvvIdx]) : undefined,
            identity_first_name: colMap.firstNameIdx >= 0 ? stripQuotes(values[colMap.firstNameIdx]) : undefined,
            identity_last_name: colMap.lastNameIdx >= 0 ? stripQuotes(values[colMap.lastNameIdx]) : undefined,
            identity_phone: colMap.phoneIdx >= 0 ? stripQuotes(values[colMap.phoneIdx]) : undefined,
            identity_email: colMap.emailIdx >= 0 ? stripQuotes(values[colMap.emailIdx]) : undefined,
            identity_address: colMap.addressIdx >= 0 ? stripQuotes(values[colMap.addressIdx]) : undefined,
          })
          imported++
        } catch (e: any) {
          errors.push(`Row ${i}: ${e.message}`)
          skipped++
        }
      }

      return { imported, skipped, errors }
    } catch (e: any) {
      return { imported: 0, skipped: 0, errors: [e.message] }
    }
  },

  // Import JSON
  'import:json': async (_: unknown) => {
    const win = getWindow()
    if (!win) return { imported: 0, skipped: 0, errors: ['No window available'] }
    const openResult = await dialog.showOpenDialog(win, {
      title: 'Import JSON',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (openResult.canceled || !openResult.filePaths[0]) {
      return { imported: 0, skipped: 0, errors: ['Cancelled'] }
    }
    const filePath = openResult.filePaths[0]

    try {
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      const items = Array.isArray(data) ? data : data.items || data.entries || []
      let imported = 0
      let skipped = 0
      const errors: string[] = []
      const vaultId = getActiveVaultId()

      // Bitwarden type numbers → our type strings
      const bwTypeMap: Record<number, string> = {
        1: 'login', 2: 'secure_note', 3: 'card', 4: 'identity',
        5: 'login', 6: 'login', 7: 'login',
      }

      for (const item of items) {
        try {
          const title = item.title || item.name || item.Name || ''
          if (!title) { skipped++; continue }

          const login = item.login || item.Login || {}
          const username = item.username || item.user || login.username || login.Username || ''
          const password = item.password || item.Password || login.password || login.Password || ''

          // URL: Bitwarden uses login.uris[].uri
          let url = ''
          if (item.url) url = item.url
          else if (item.Url) url = item.Url
          else if (login.uris && Array.isArray(login.uris) && login.uris.length > 0)
            url = login.uris[0].uri || login.uris[0].Uri || ''
          else if (login.Uri) url = login.Uri

          const totp = login.totp || login.TOTP || item.totp || ''

          let entryType: string
          if (typeof item.type === 'number') entryType = bwTypeMap[item.type] || 'login'
          else if (typeof item.Type === 'number') entryType = bwTypeMap[item.Type] || 'login'
          else entryType = item.type || item.Type || 'login'

          const notes = item.notes || item.Notes || item.note || ''

          const card = item.card || item.Card || {}
          const identity = item.identity || item.Identity || {}

          // Skip duplicates
          if (await isDuplicateEntry(title, username, vaultId)) {
            skipped++
            continue
          }

          await entriesService.createEntry({
            entry_type: entryType as any,
            title,
            username: String(username),
            password: String(password),
            url: String(url),
            notes: String(notes),
            totp_secret: totp ? String(totp) : undefined,
            card_number: card.number || card.Number ? String(card.number || card.Number) : undefined,
            card_holder: card.cardholderName || card.CardholderName ? String(card.cardholderName || card.CardholderName) : undefined,
            card_expiry: (card.expMonth && card.expYear) ? `${card.expMonth}/${card.expYear}` : (card.expirationDate || ''),
            card_cvv: card.code || card.CVV ? String(card.code || card.CVV) : undefined,
            identity_first_name: identity.firstName || identity.FirstName ? String(identity.firstName || identity.FirstName) : undefined,
            identity_last_name: identity.lastName || identity.LastName ? String(identity.lastName || identity.LastName) : undefined,
            identity_phone: identity.phone || identity.Phone ? String(identity.phone || identity.Phone) : undefined,
            identity_email: identity.email || identity.Email ? String(identity.email || identity.Email) : undefined,
            identity_address: identity.address1 || identity.Address1 ? String(identity.address1 || identity.Address1) : undefined,
            identity_ssn: identity.ssn || identity.SSN ? String(identity.ssn || identity.SSN) : undefined,
            identity_passport: identity.passportNumber || identity.PassportNumber ? String(identity.passportNumber || identity.PassportNumber) : undefined,
            identity_birthdate: identity.birthDate || identity.BirthDate ? String(identity.birthDate || identity.BirthDate) : undefined,
          })
          imported++
        } catch (e: any) {
          errors.push(`Item: ${e.message}`)
          skipped++
        }
      }

      return { imported, skipped, errors }
    } catch (e: any) {
      return { imported: 0, skipped: 0, errors: [e.message] }
    }
  },

  // Export CSV
  'export:csv': async (_: unknown, entryIds?: number[]) => {
    const win = getWindow()
    if (!win) return { success: false }
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'Export CSV',
      defaultPath: 'vault-export.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    })
    if (saveResult.canceled || !saveResult.filePath) return { success: false }
    const filePath = saveResult.filePath

    const entries = entryIds
      ? (await Promise.allSettled(entryIds.map(id => entriesService.getEntry(id))))
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value)
      : (await entriesService.listEntries()).map(e => ({ ...e } as any))

    const csvLines = ['name,url,username,password,notes,type,card_number,card_holder,card_expiry,card_cvv']
    for (const entry of entries) {
      if (!entry) continue
      const e = entry as any
      const title = e.display_title || e.title || ''
      const username = e.username || ''
      const password = e.password || ''
      const url = e.url || e.display_url || ''
      const notes = (e.notes || '').replace(/\n/g, ' ')
      const type = e.entry_type || 'login'
      const cardNumber = e.card_number || ''
      const cardHolder = e.card_holder || ''
      const cardExpiry = e.card_expiry || ''
      const cardCvv = e.card_cvv || ''
      csvLines.push(`"${escapeCSV(title)}","${escapeCSV(url)}","${escapeCSV(username)}","${escapeCSV(password)}","${escapeCSV(notes)}","${type}","${escapeCSV(cardNumber)}","${escapeCSV(cardHolder)}","${escapeCSV(cardExpiry)}","${escapeCSV(cardCvv)}"`)
    }

    writeFileSync(filePath, csvLines.join('\n'), 'utf-8')
    return { success: true }
  },

  // Export JSON
  'export:json': async (_: unknown, entryIds?: number[]) => {
    const win = getWindow()
    if (!win) return { success: false }
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'Export JSON',
      defaultPath: 'vault-export.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    })
    if (saveResult.canceled || !saveResult.filePath) return { success: false }
    const filePath = saveResult.filePath

    const entries = entryIds
      ? (await Promise.allSettled(entryIds.map(id => entriesService.getEntry(id))))
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value)
      : (await entriesService.listEntries()).map(e => ({ ...e } as any))

    const data = entries.filter(Boolean).map((entry: any) => ({
      title: entry.display_title || entry.title || '',
      username: entry.username || '',
      password: entry.password || '',
      url: entry.url || entry.display_url || '',
      notes: entry.notes || '',
      type: entry.entry_type || 'login',
      card_number: entry.card_number || '',
      card_holder: entry.card_holder || '',
      card_expiry: entry.card_expiry || '',
      card_cvv: entry.card_cvv || '',
    }))

    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  },
}

function stripQuotes(s: string): string {
  return (s || '').replace(/^"(.*)"$/, '$1')
}

function escapeCSV(value: string): string {
  return value.replace(/"/g, '""')
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote (RFC 4180): "" inside quoted field
        current += '"'
        i++ // skip next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      if (char !== '\r') {
        current += char
      }
    }
  }
  result.push(current.trim())
  return result
}

async function checkDuplicatePassword(password: string): Promise<{ duplicated: boolean; count: number; titles: string[] }> {
  try {
    const db = await getDatabase()
    const { getEncryptionKey } = await import('../services/vault.service')
    const { decryptJSON } = await import('../crypto/encryption')
    const encKey = getEncryptionKey()
    if (!encKey) return { duplicated: false, count: 0, titles: [] }

    const vaultId = (await import('../services/vault.service')).getActiveVaultId()
    const result = db.exec(
      'SELECT id, display_title, encrypted_data, iv, auth_tag FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ?',
      [vaultId]
    )

    if (result.length === 0) return { duplicated: false, count: 0, titles: [] }

    const titles: string[] = []
    for (const row of result[0].values) {
      try {
        const decrypted = decryptJSON<Record<string, string>>(
          { iv: row[3] as string, ciphertext: row[2] as string, authTag: row[4] as string },
          encKey
        )
        if (decrypted.password === password) {
          titles.push(row[1] as string)
        }
      } catch {}
    }

    return {
      duplicated: titles.length > 0,
      count: titles.length,
      titles,
    }
  } catch {
    return { duplicated: false, count: 0, titles: [] }
  }
}

async function isDuplicateEntry(title: string, username: string, vaultId?: number): Promise<boolean> {
  try {
    const db = await getDatabase()
    const vid = vaultId ?? 1
    // Use display_title for duplicate check (username is encrypted and not searchable)
    const result = db.exec(
      "SELECT COUNT(*) as count FROM encrypted_entries WHERE display_title = ? AND vault_id = ?",
      [title, vid]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      return (result[0].values[0][0] as number) > 0
    }
  } catch {}
  return false
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
