import { PlatformBridge } from '../../shared/bridge'

// ─── Tauri Clipboard ─────────────────────────────────────

const tauriClipboard = {
  async writeText(text: string): Promise<void> {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(text)
  },

  async readText(): Promise<string> {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
    return await readText()
  },

  async clear(): Promise<void> {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText('')
  },
}

// ─── Tauri Biometric ──────────────────────────────────────

const tauriBiometric = {
  async isAvailable(): Promise<boolean> {
    try {
      const { checkStatus } = await import('@tauri-apps/plugin-biometric')
      const status = await checkStatus()
      return status.isAvailable
    } catch {
      return false
    }
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<boolean> {
    try {
      const { authenticate } = await import('@tauri-apps/plugin-biometric')
      await authenticate(reason, {
        title,
        subtitle,
        cancelTitle: 'Отмена',
        allowDeviceCredential: true,
        confirmationRequired: false,
      })
      return true
    } catch {
      return false
    }
  },
}

// ─── Tauri Filesystem ──────────────────────────────────────

const BASE_DIR = 'Storage'

const tauriFileSystem = {
  async readFile(path: string): Promise<string> {
    const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(path, { baseDir: BaseDirectory.AppData })
  },

  async writeFile(path: string, data: string): Promise<void> {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, data, { baseDir: BaseDirectory.AppData })
  },

  async exists(path: string): Promise<boolean> {
    const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    return await exists(path, { baseDir: BaseDirectory.AppData })
  },

  async mkdir(path: string): Promise<void> {
    const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
  },

  async readDir(path: string): Promise<string[]> {
    const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    const entries = await readDir(path, { baseDir: BaseDirectory.AppData })
    return entries.map((e: any) => e.name || '')
  },

  async deleteFile(path: string): Promise<void> {
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await remove(path, { baseDir: BaseDirectory.AppData })
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    const { rename, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await rename(oldPath, newPath, { baseDir: BaseDirectory.AppData })
  },
}

// ─── Tauri Dialog ──────────────────────────────────────────

const tauriDialog = {
  async showOpenDialog(options: {
    title: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  }): Promise<{ filePaths: string[] }> {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({
      title: options.title,
      filters: options.filters?.map(f => ({
        name: f.name,
        extensions: f.extensions,
      })),
      multiple: options.properties?.includes('multiSelections'),
    })
    if (Array.isArray(result)) {
      return { filePaths: result as string[] }
    }
    return { filePaths: result ? [result as string] : [] }
  },

  async showSaveDialog(options: {
    title: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ filePath: string }> {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const result = await save({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters?.map(f => ({
        name: f.name,
        extensions: f.extensions,
      })),
    })
    return { filePath: result || '' }
  },
}

// ─── Tauri Database (stub — same as Capacitor) ─────────────

const tauriDatabase = {
  async init(): Promise<void> {},
  async run(): Promise<void> {},
  async query(): Promise<any[]> { return [] },
  async close(): Promise<void> {},
  getDatabasePath(): string { return 'vault.db' },
}

// ─── App Lifecycle ─────────────────────────────────────────

let appStateCallback: ((state: 'active' | 'background') => void) | null = null

export function onAppStateChange(callback: (state: 'active' | 'background') => void): void {
  appStateCallback = callback

  // Use Tauri visibility change events
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('tauri://blur', () => callback('background'))
    listen('tauri://focus', () => callback('active'))
  }).catch(() => {
    document.addEventListener('visibilitychange', () => {
      callback(document.hidden ? 'background' : 'active')
    })
  })
}

// ─── Tauri Platform Bridge ─────────────────────────────────

export const tauriBridge: PlatformBridge = {
  clipboard: tauriClipboard,
  biometric: tauriBiometric,
  filesystem: tauriFileSystem,
  dialog: tauriDialog,
  database: tauriDatabase,
}

export default tauriBridge
