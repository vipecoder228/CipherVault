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

// Capacitor Biometric implementation via @capgo/capacitor-native-biometric
const capacitorBiometric = {
  async isAvailable(): Promise<boolean> {
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
      const result = await NativeBiometric.isAvailable({ useFallback: true })
      return result.isAvailable
    } catch {
      return false
    }
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<boolean> {
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
      await NativeBiometric.verifyIdentity({
        title,
        subtitle,
        reason,
        negativeButtonText: 'Отмена',
        useFallback: true,
      })
      return true
    } catch {
      return false
    }
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

// Capacitor Database — NOT USED
// The app uses webDb.ts (sql.js + Capacitor Filesystem) for database operations.
// This stub exists only to satisfy the PlatformBridge interface.
const capacitorDatabase = {
  async init(): Promise<void> {},
  async run(): Promise<void> {},
  async query(): Promise<any[]> { return [] },
  async close(): Promise<void> {},
  getDatabasePath(): string { return 'vault.db' },
}

// ─── App Lifecycle (auto-lock on background) ──────────

let appStateCallback: ((state: 'active' | 'background') => void) | null = null

export function onAppStateChange(callback: (state: 'active' | 'background') => void): void {
  appStateCallback = callback

  // Use Capacitor App plugin if available
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appStateChange', ({ isActive }) => {
      callback(isActive ? 'active' : 'background')
    })
  }).catch(() => {
    // Fallback: use document visibilitychange
    document.addEventListener('visibilitychange', () => {
      callback(document.hidden ? 'background' : 'active')
    })
  })
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
