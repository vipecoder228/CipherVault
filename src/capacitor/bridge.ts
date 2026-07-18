import { PlatformBridge } from '../../shared/bridge'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Clipboard as CapacitorClipboard } from '@capacitor/clipboard'

// Capacitor Clipboard implementation
const capacitorClipboard = {
  async writeText(text: string): Promise<void> {
    await CapacitorClipboard.write({ string: text })
  },

  async readText(): Promise<string> {
    const result = await CapacitorClipboard.read()
    return result.value || ''
  },

  async clear(): Promise<void> {
    await CapacitorClipboard.write({ string: '' })
  },
}

// Biometric authentication (placeholder - needs native plugin)
const capacitorBiometric = {
  async isAvailable(): Promise<boolean> {
    // TODO: Implement with native biometric plugin
    return false
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<boolean> {
    // TODO: Implement with native biometric plugin
    // For now, return true (no biometric required)
    return true
  },
}

// Capacitor Filesystem implementation
const capacitorFileSystem = {
  async readFile(path: string): Promise<string> {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    return result.data as string
  },

  async writeFile(path: string, data: string): Promise<void> {
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
  },

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({
        path,
        directory: Directory.Data,
      })
      return true
    } catch {
      return false
    }
  },

  async mkdir(path: string): Promise<void> {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive: true,
    })
  },

  async readDir(path: string): Promise<string[]> {
    const result = await Filesystem.readdir({
      path,
      directory: Directory.Data,
    })
    return result.files.map(f => f.name)
  },

  async deleteFile(path: string): Promise<void> {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Data,
    })
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    await Filesystem.rename({
      from: oldPath,
      to: newPath,
      directory: Directory.Data,
    })
  },
}

// Capacitor Dialog implementation
const capacitorDialog = {
  async showOpenDialog(options: {
    title: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  }): Promise<{ filePaths: string[] }> {
    // Capacitor doesn't have a direct file picker like Electron
    // We'll use a web-based file input as fallback
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'

      if (options.filters && options.filters.length > 0) {
        const accept = options.filters
          .flatMap(f => f.extensions.map(e => `.${e}`))
          .join(',')
        input.accept = accept
      }

      input.onchange = () => {
        const files = Array.from(input.files || [])
        resolve({ filePaths: files.map(f => f.name) })
      }

      input.click()
    })
  },

  async showSaveDialog(options: {
    title: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ filePath: string }> {
    // Use a web-based approach
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = options.filters
        ? options.filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',')
        : '*'

      input.onchange = () => {
        const file = input.files?.[0]
        resolve({ filePath: file?.name || '' })
      }

      input.click()
    })
  },
}

// Capacitor Database implementation (using Preferences as simple storage)
const capacitorDatabase = {
  async init(dbPath: string): Promise<void> {
    // Initialize database storage
    console.log('Database initialized at:', dbPath)
  },

  async run(sql: string, params?: any[]): Promise<void> {
    // TODO: Implement SQLite with sql.js + Capacitor filesystem
    console.log('SQL run:', sql, params)
  },

  async query(sql: string, params?: any[]): Promise<any[]> {
    // TODO: Implement SQLite with sql.js + Capacitor filesystem
    console.log('SQL query:', sql, params)
    return []
  },

  async close(): Promise<void> {
    // Close database
  },

  getDatabasePath(): string {
    return 'vault.db'
  },
}

// Create Capacitor platform bridge
export const capacitorBridge: PlatformBridge = {
  clipboard: capacitorClipboard,
  biometric: capacitorBiometric,
  filesystem: capacitorFileSystem,
  dialog: capacitorDialog,
  database: capacitorDatabase,
}

export default capacitorBridge
