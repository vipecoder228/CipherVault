// Google Drive sync service
// Provides cloud synchronization via Google Drive

import { isCapacitor, isElectron } from '../../shared/bridge'

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
// Client ID must be set via environment variable or config file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file']
const VAULT_FILE_NAME = 'ciphervault.db'

// Capacitor Google Drive implementation
const capacitorGoogleDrive: SyncService = {
  async isAvailable(): Promise<boolean> {
    // Check if Google Sign-In plugin is available
    try {
      await import('@codetrix-studio/capacitor-google-auth')
      return true
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
      // Get access token
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      const tokens = await GoogleAuth.getTokens()

      if (!tokens.accessToken) {
        return { success: false, error: 'Not authenticated', timestamp }
      }

      // Get vault file
      const vaultData = await this.getVaultFile()

      // Upload to Google Drive
      const config = await this.getConfig()
      if (config.folderId) {
        await this.uploadToDrive(tokens.accessToken, config.folderId, vaultData)
      }

      // Update last sync time
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

  // Helper: Get vault file content
  async getVaultFile(): Promise<string> {
    // TODO: Read from actual database
    return ''
  },

  // Helper: Upload file to Google Drive
  async uploadToDrive(accessToken: string, folderId: string, content: string): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: this.createMultipartBody(folderId, content),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to upload to Google Drive')
    }
  },

  // Helper: Create multipart request body
  createMultipartBody(folderId: string, content: string): FormData {
    const metadata = {
      name: VAULT_FILE_NAME,
      parents: [folderId],
    }

    const formData = new FormData()
    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    )
    formData.append('file', new Blob([content], { type: 'application/octet-stream' }))

    return formData
  },
}

// Electron Google Drive implementation (placeholder)
const electronGoogleDrive: SyncService = {
  async isAvailable(): Promise<boolean> {
    // TODO: Implement with Electron
    return false
  },

  async authenticate(): Promise<boolean> {
    return false
  },

  async signOut(): Promise<void> {},

  async isAuthenticated(): Promise<boolean> {
    return false
  },

  async getConfig(): Promise<SyncConfig> {
    return DEFAULT_CONFIG
  },

  async setConfig(config: Partial<SyncConfig>): Promise<void> {},

  async sync(): Promise<SyncResult> {
    return { success: false, error: 'Not implemented', timestamp: Date.now() }
  },

  async getLastSyncTime(): Promise<number | null> {
    return null
  },

  async getSyncFolder(): Promise<string | null> {
    return null
  },

  async setSyncFolder(folderId: string): Promise<void> {},
}

// Web fallback (no sync support)
const webSync: SyncService = {
  async isAvailable(): Promise<boolean> {
    return false
  },

  async authenticate(): Promise<boolean> {
    return false
  },

  async signOut(): Promise<void> {},

  async isAuthenticated(): Promise<boolean> {
    return false
  },

  async getConfig(): Promise<SyncConfig> {
    return DEFAULT_CONFIG
  },

  async setConfig(config: Partial<SyncConfig>): Promise<void> {},

  async sync(): Promise<SyncResult> {
    return { success: false, error: 'Not supported on web', timestamp: Date.now() }
  },

  async getLastSyncTime(): Promise<number | null> {
    return null
  },

  async getSyncFolder(): Promise<string | null> {
    return null
  },

  async setSyncFolder(folderId: string): Promise<void> {},
}

// Get the appropriate sync service based on platform
export function getSyncService(): SyncService {
  if (isCapacitor) {
    return capacitorGoogleDrive
  }
  if (isElectron) {
    return electronGoogleDrive
  }
  return webSync
}

// Singleton instance
let syncService: SyncService | null = null

export function getSync(): SyncService {
  if (!syncService) {
    syncService = getSyncService()
  }
  return syncService
}

export default getSync
