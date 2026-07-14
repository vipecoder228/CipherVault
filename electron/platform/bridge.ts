import { PlatformBridge } from '../../shared/bridge'
import { clipboard, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Electron Clipboard implementation
const electronClipboard = {
  async writeText(text: string): Promise<void> {
    clipboard.writeText(text)
  },

  async readText(): Promise<string> {
    return clipboard.readText()
  },

  async clear(): Promise<void> {
    clipboard.clear()
  },
}

// Biometric authentication (not available in Electron by default)
const electronBiometric = {
  async isAvailable(): Promise<boolean> {
    // TODO: Implement with native keychain integration
    return false
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<boolean> {
    // TODO: Implement with native keychain integration
    // For now, return true (no biometric required)
    return true
  },
}

// Electron Filesystem implementation
const electronFileSystem = {
  async readFile(path: string): Promise<string> {
    return readFileSync(path, 'utf-8')
  },

  async writeFile(path: string, data: string): Promise<void> {
    // Ensure directory exists
    const dir = join(path, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(path, data, 'utf-8')
  },

  async exists(path: string): Promise<boolean> {
    return existsSync(path)
  },

  async mkdir(path: string): Promise<void> {
    mkdirSync(path, { recursive: true })
  },

  async readDir(path: string): Promise<string[]> {
    return readdirSync(path)
  },

  async deleteFile(path: string): Promise<void> {
    unlinkSync(path)
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    renameSync(oldPath, newPath)
  },
}

// Electron Dialog implementation
const electronDialog = {
  async showOpenDialog(options: {
    title: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  }): Promise<{ filePaths: string[] }> {
    const result = await dialog.showOpenDialog({
      title: options.title,
      filters: options.filters,
      properties: options.properties as any,
    })
    return { filePaths: result.filePaths }
  },

  async showSaveDialog(options: {
    title: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ filePath: string }> {
    const result = await dialog.showSaveDialog({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
    })
    return { filePath: result.filePath || '' }
  },
}

// Electron Database implementation (using existing db module)
const electronDatabase = {
  async init(dbPath: string): Promise<void> {
    // Use existing database initialization
    const { getDatabase } = require('../main/db/connection')
    await getDatabase()
  },

  async run(sql: string, params?: any[]): Promise<void> {
    const { getDatabase } = require('../main/db/connection')
    const db = await getDatabase()
    db.run(sql, params)
  },

  async query(sql: string, params?: any[]): Promise<any[]> {
    const { getDatabase } = require('../main/db/connection')
    const db = await getDatabase()
    return db.exec(sql, params)
  },

  async close(): Promise<void> {
    // Close database
  },

  getDatabasePath(): string {
    return join(app.getPath('userData'), 'vault-data', 'vault.db')
  },
}

// Create Electron platform bridge
export const electronBridge: PlatformBridge = {
  clipboard: electronClipboard,
  biometric: electronBiometric,
  filesystem: electronFileSystem,
  dialog: electronDialog,
  database: electronDatabase,
}

export default electronBridge
