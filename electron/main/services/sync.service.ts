import { watch, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs'
import { join } from 'path'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { dialog, BrowserWindow } from 'electron'
import { getDatabasePath, saveDatabase, getDatabase, resetDatabase } from '../db/connection'
import { ERRORS } from '../../../shared/errors'
import { deriveKey, splitDerivedKey } from '../crypto/keyderivation'
import { CRYPTO } from '../crypto/constants'
import { isAlarmMode } from './vault.service'
import { getWindow } from '../utils/window'

const SYNC_FILENAME = 'ciphervault.vault'
const MAGIC = 'CIPHERVAULT'
const VERSION = 1
const HEADER_SIZE = 11 + 1 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE + CRYPTO.AUTH_TAG_SIZE

let syncWatcher: any = null
let syncFolder: string | null = null
let syncPassword: string | null = null // Note: JS strings cannot be securely zeroed
let syncEnabled = false
let lastSyncTime: number = 0
let isSyncing = false
let suppressWatcher = false

// ─── State ───────────────────────────────────────────

export function getSyncStatus() {
  return {
    enabled: syncEnabled,
    folder: syncFolder,
    lastSyncTime,
    isSyncing,
  }
}

// ─── Export to sync folder ────────────────────────────

async function exportToSync(): Promise<boolean> {
  if (!syncFolder || !syncPassword || isSyncing || isAlarmMode()) return false
  isSyncing = true
  suppressWatcher = true

  try {
    saveDatabase()
    const dbPath = getDatabasePath()
    const dbBuffer = readFileSync(dbPath)

    const salt = randomBytes(CRYPTO.SALT_SIZE)
    const key = await deriveKey(syncPassword, salt)
    const { encryptionKey } = splitDerivedKey(key)

    const iv = randomBytes(CRYPTO.IV_SIZE)
    const cipher = createCipheriv(CRYPTO.ENCRYPTION_ALGO, encryptionKey, iv, {
      authTagLength: CRYPTO.AUTH_TAG_SIZE,
    })
    const encrypted = Buffer.concat([cipher.update(dbBuffer), cipher.final()])
    const authTag = cipher.getAuthTag()

    const header = Buffer.concat([
      Buffer.from(MAGIC, 'ascii'),
      Buffer.from([VERSION]),
      salt, iv, authTag,
    ])

    const syncPath = join(syncFolder, SYNC_FILENAME)
    const tmpPath = syncPath + '.tmp'
    writeFileSync(tmpPath, Buffer.concat([header, encrypted]))
    renameSync(tmpPath, syncPath)
    lastSyncTime = Date.now()
    return true
  } catch (err) {
    console.error('[CipherVault] Sync export failed:', err)
    return false
  } finally {
    isSyncing = false
    setTimeout(() => { suppressWatcher = false }, 1000)
  }
}

// ─── Import from sync folder ──────────────────────────

async function importFromSync(): Promise<boolean> {
  if (!syncFolder || !syncPassword || isSyncing) return false
  isSyncing = true

  try {
    const syncPath = join(syncFolder, SYNC_FILENAME)

    let fileBuffer: Buffer
    try {
      fileBuffer = readFileSync(syncPath)
    } catch {
      return false
    }
    if (fileBuffer.length < HEADER_SIZE) return false

    const magic = fileBuffer.subarray(0, 11).toString('ascii')
    if (magic !== MAGIC) return false

    const version = fileBuffer[11]
    if (version !== 1) return false

    const salt = fileBuffer.subarray(12, 12 + CRYPTO.SALT_SIZE)
    const iv = fileBuffer.subarray(12 + CRYPTO.SALT_SIZE, 12 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE)
    const authTag = fileBuffer.subarray(
      12 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE,
      12 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE + CRYPTO.AUTH_TAG_SIZE
    )
    const encryptedData = fileBuffer.subarray(HEADER_SIZE)

    const key = await deriveKey(syncPassword, salt)
    const { encryptionKey } = splitDerivedKey(key)

    const decipher = createDecipheriv(CRYPTO.ENCRYPTION_ALGO, encryptionKey, iv, {
      authTagLength: CRYPTO.AUTH_TAG_SIZE,
    })
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])

    // Check if different from current DB
    const dbPath = getDatabasePath()
    const currentBuffer = readFileSync(dbPath)
    if (decrypted.equals(currentBuffer)) return false

    // Backup before overwrite
    const backupPath = dbPath + '.bak'
    copyFileSync(dbPath, backupPath)

    // Replace local database
    writeFileSync(dbPath, decrypted)
    resetDatabase()
    lastSyncTime = Date.now()
    return true
  } catch (err) {
    console.error('[CipherVault] Sync import failed:', err)
    return false
  } finally {
    isSyncing = false
  }
}

// ─── File Watcher ─────────────────────────────────────

function startWatching(): void {
  if (!syncFolder || syncWatcher) return

  try {
    syncWatcher = watch(syncFolder, (eventType, filename) => {
      if (filename === SYNC_FILENAME && eventType === 'change' && !suppressWatcher) {
        importFromSync().then((imported) => {
          if (imported) {
            BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send('sync:imported')
            })
          }
        })
      }
    })
  } catch (err) {
    console.error('[CipherVault] Failed to start sync watcher:', err)
  }
}

function stopWatching(): void {
  if (syncWatcher) {
    syncWatcher.close()
    syncWatcher = null
  }
}

// ─── Public API ───────────────────────────────────────

export async function selectSyncFolder(): Promise<{ success: boolean; folder?: string; error?: string }> {
  const win = getWindow()
  if (!win) return { success: false, error: ERRORS.BACKUP_NO_WINDOW }
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Sync Folder',
    properties: ['openDirectory'],
  })

  if (result.canceled || !result.filePaths[0]) {
    return { success: false }
  }

  const folder = result.filePaths[0]
  syncFolder = folder
  syncEnabled = true

  const db = await getDatabase()
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_folder', ?)", [folder])
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_enabled', 'true')")
  saveDatabase()

  startWatching()
  await exportToSync()

  return { success: true, folder }
}

export async function setSyncPassword(password: string): Promise<void> {
  syncPassword = password
}

export async function syncNow(): Promise<{ success: boolean; error?: string }> {
  if (!syncEnabled || !syncFolder) {
    return { success: false, error: ERRORS.SYNC_NOT_CONFIGURED }
  }

  const exported = await exportToSync()
  if (!exported) {
    return { success: false, error: ERRORS.SYNC_EXPORT_FAILED }
  }

  return { success: true }
}

export async function disableSync(): Promise<void> {
  stopWatching()
  syncEnabled = false
  syncFolder = null
  syncPassword = null

  const db = await getDatabase()
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_enabled', 'false')")
  db.run("DELETE FROM settings WHERE key = 'sync_folder'")
  saveDatabase()
}

export async function loadSyncSettings(): Promise<{ enabled: boolean; folder: string | null }> {
  try {
    const db = await getDatabase()
    const enabledResult = db.exec("SELECT value FROM settings WHERE key = 'sync_enabled'")
    const folderResult = db.exec("SELECT value FROM settings WHERE key = 'sync_folder'")

    const enabled = enabledResult.length > 0 && enabledResult[0].values.length > 0
      ? enabledResult[0].values[0][0] === 'true'
      : false
    const folder = folderResult.length > 0 && folderResult[0].values.length > 0
      ? folderResult[0].values[0][0] as string
      : null

    if (enabled && folder) {
      syncEnabled = true
      syncFolder = folder
      startWatching()
    }

    return { enabled, folder }
  } catch {
    return { enabled: false, folder: null }
  }
}

export function startSync(): void {
  if (syncEnabled && syncFolder) {
    startWatching()
  }
}

export function stopSync(): void {
  stopWatching()
}
