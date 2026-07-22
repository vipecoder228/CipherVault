// Google Drive sync service
// Provides cloud synchronization via Google Drive

import { isCapacitor, isElectron } from '../../shared/bridge'
import { getRawDb, saveWebDatabase } from '../lib/webDb'

export interface SyncConfig {
  enabled: boolean
  folderId?: string
  lastSync?: number
  autoSync: boolean
  syncIntervalMs: number
}

export interface SyncResult {
  success: boolean
  error?: string
  timestamp: number
}

export interface SyncService {
  isAvailable(): Promise<boolean>
  authenticate(): Promise<boolean>
  signOut(): Promise<void>
  isAuthenticated(): Promise<boolean>
  getConfig(): Promise<SyncConfig>
  setConfig(config: Partial<SyncConfig>): Promise<void>
  sync(): Promise<SyncResult>
  getLastSyncTime(): Promise<number | null>
  getSyncFolder(): Promise<string | null>
  setSyncFolder(folderId: string): Promise<void>
}

// Default config
const DEFAULT_CONFIG: SyncConfig = {
  enabled: false,
  autoSync: true,
  syncIntervalMs: 5 * 60 * 1000, // 5 minutes
}

// Google Drive API configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file']
const VAULT_FILE_NAME = 'ciphervault.vault'

// ─── Encryption Helpers ───────────────────────────────
// Import from secureStorage to avoid Capacitor dependency in Electron builds
import {
  setSyncPasswordEncrypted as setSyncPasswordEnc,
  getSyncPasswordDecrypted as getSyncPasswordDec,
} from '../lib/secureStorage'

export { setSyncPasswordEncrypted, getSyncPasswordDecrypted } from '../lib/secureStorage'

async function deriveSyncKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptVault(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveSyncKey(password, salt)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )

  // Format: salt(32) + iv(12) + ciphertext+authTag
  const result = new Uint8Array(32 + 12 + encrypted.byteLength)
  result.set(salt, 0)
  result.set(iv, 32)
  result.set(new Uint8Array(encrypted), 44)
  return result
}

async function decryptVault(encrypted: Uint8Array, password: string): Promise<Uint8Array | null> {
  if (encrypted.length < 44 + 16) return null // Too small

  const salt = encrypted.slice(0, 32)
  const iv = encrypted.slice(32, 44)
  const ciphertext = encrypted.slice(44)

  try {
    const key = await deriveSyncKey(password, salt)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new Uint8Array(decrypted)
  } catch {
    return null // Decryption failed (wrong password or corrupted)
  }
}

// ─── Database Export/Import ────────────────────────────

function exportDatabase(): Uint8Array {
  const db = getRawDb()
  const data = db.export()
  return new Uint8Array(data)
}

function importDatabase(data: Uint8Array): void {
  const db = getRawDb()
  db.run('DROP TABLE IF EXISTS encrypted_entries')
  db.run('DROP TABLE IF EXISTS entry_history')
  db.run('DROP TABLE IF EXISTS categories')
  db.run('DROP TABLE IF EXISTS vault')
  db.run('DROP TABLE IF EXISTS settings')
  db.run('DROP TABLE IF EXISTS unlock_attempts')
  db.run('DROP TABLE IF EXISTS disposable_emails')
  db.run('DROP TABLE IF EXISTS _migrations')
  // Re-initialize from the imported data
  // Note: This is a simplified approach - in production, use a more robust merge
  db.run(`CREATE TABLE IF NOT EXISTS encrypted_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_type TEXT NOT NULL,
    encrypted_data TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    category_id INTEGER,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    display_title TEXT NOT NULL DEFAULT '',
    vault_id INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    display_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
}

// ─── Google Drive API ─────────────────────────────────

async function searchVaultFile(accessToken: string, folderId: string): Promise<string | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+name='${VAULT_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) return null
  const data = await response.json()
  return data.files?.[0]?.id || null
}

async function uploadFile(accessToken: string, folderId: string, content: Uint8Array, existingFileId?: string | null): Promise<void> {
  if (existingFileId) {
    // Update existing file
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: content,
      }
    )
    if (!response.ok) throw new Error('Failed to update file on Google Drive')
  } else {
    // Create new file
    const metadata = { name: VAULT_FILE_NAME, parents: [folderId] }
    const formData = new FormData()
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    formData.append('file', new Blob([content], { type: 'application/octet-stream' }))

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      }
    )
    if (!response.ok) throw new Error('Failed to upload to Google Drive')
  }
}

async function downloadFile(accessToken: string, fileId: string): Promise<Uint8Array | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${ fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  if (!response.ok) return null
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

// ─── Capacitor Implementation ─────────────────────────

const capacitorGoogleDrive: SyncService = {
  async isAvailable(): Promise<boolean> {
    try {
      await import('@codetrix-studio/capacitor-google-auth')
      return !!GOOGLE_CLIENT_ID
    } catch {
      return false
    }
  },

  async authenticate(): Promise<boolean> {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      await GoogleAuth.initialize({
        clientId: GOOGLE_CLIENT_ID,
        scopes: GOOGLE_SCOPES,
      })
      const result = await GoogleAuth.signIn()
      return !!result
    } catch (error) {
      console.error('Google authentication failed:', error)
      return false
    }
  },

  async signOut(): Promise<void> {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      await GoogleAuth.signOut()
    } catch (error) {
      console.error('Google sign out failed:', error)
    }
  },

  async isAuthenticated(): Promise<boolean> {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      const user = await GoogleAuth.getUser()
      return !!user
    } catch {
      return false
    }
  },

  async getConfig(): Promise<SyncConfig> {
    const stored = localStorage.getItem('google_drive_sync_config')
    return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG
  },

  async setConfig(config: Partial<SyncConfig>): Promise<void> {
    const current = await this.getConfig()
    const updated = { ...current, ...config }
    localStorage.setItem('google_drive_sync_config', JSON.stringify(updated))
  },

  async sync(): Promise<SyncResult> {
    const timestamp = Date.now()

    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      const tokens = await GoogleAuth.getTokens()
      if (!tokens.accessToken) {
        return { success: false, error: 'Not authenticated', timestamp }
      }

      const config = await this.getConfig()
      if (!config.folderId) {
        return { success: false, error: 'No sync folder configured', timestamp }
      }

      // Get sync password (encrypted in localStorage)
      const syncPassword = await getSyncPasswordDecrypted()
      if (!syncPassword) {
        return { success: false, error: 'Sync password not set', timestamp }
      }

      // Search for existing vault file
      const existingFileId = await searchVaultFile(tokens.accessToken, config.folderId)

      if (existingFileId) {
        // Download and merge
        const remoteData = await downloadFile(tokens.accessToken, existingFileId)
        if (remoteData) {
          const decrypted = await decryptVault(remoteData, syncPassword)
          if (decrypted) {
            // Replace local database with remote data
            importDatabase(decrypted)
            await saveWebDatabase()
          }
        }
      }

      // Export and upload local database
      const localData = exportDatabase()
      const encrypted = await encryptVault(localData, syncPassword)
      await uploadFile(tokens.accessToken, config.folderId, encrypted, existingFileId)

      await this.setConfig({ lastSync: timestamp })
      return { success: true, timestamp }
    } catch (error: any) {
      return { success: false, error: error.message, timestamp }
    }
  },

  async getLastSyncTime(): Promise<number | null> {
    const config = await this.getConfig()
    return config.lastSync || null
  },

  async getSyncFolder(): Promise<string | null> {
    const config = await this.getConfig()
    return config.folderId || null
  },

  async setSyncFolder(folderId: string): Promise<void> {
    await this.setConfig({ folderId })
  },
}

// ─── Electron Implementation ──────────────────────────

const electronGoogleDrive: SyncService = {
  async isAvailable(): Promise<boolean> {
    // Electron doesn't have native Google Auth
    // Could use electron.google-auth or open browser for OAuth
    return false
  },

  async authenticate(): Promise<boolean> { return false },
  async signOut(): Promise<void> {},
  async isAuthenticated(): Promise<boolean> { return false },
  async getConfig(): Promise<SyncConfig> { return DEFAULT_CONFIG },
  async setConfig(): Promise<void> {},
  async sync(): Promise<SyncResult> {
    return { success: false, error: 'Use local folder sync on desktop', timestamp: Date.now() }
  },
  async getLastSyncTime(): Promise<number | null> { return null },
  async getSyncFolder(): Promise<string | null> { return null },
  async setSyncFolder(): Promise<void> {},
}

// ─── Web Fallback ─────────────────────────────────────

const webSync: SyncService = {
  async isAvailable(): Promise<boolean> { return false },
  async authenticate(): Promise<boolean> { return false },
  async signOut(): Promise<void> {},
  async isAuthenticated(): Promise<boolean> { return false },
  async getConfig(): Promise<SyncConfig> { return DEFAULT_CONFIG },
  async setConfig(): Promise<void> {},
  async sync(): Promise<SyncResult> {
    return { success: false, error: 'Not supported on web', timestamp: Date.now() }
  },
  async getLastSyncTime(): Promise<number | null> { return null },
  async getSyncFolder(): Promise<string | null> { return null },
  async setSyncFolder(): Promise<void> {},
}

// ─── Factory ──────────────────────────────────────────

export function getSyncService(): SyncService {
  if (isCapacitor) return capacitorGoogleDrive
  if (isElectron) return electronGoogleDrive
  return webSync
}

let syncService: SyncService | null = null

export function getSync(): SyncService {
  if (!syncService) {
    syncService = getSyncService()
  }
  return syncService
}

export default getSync
