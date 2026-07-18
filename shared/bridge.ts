// Platform abstraction layer
// Provides a unified interface for platform-specific functionality

// Platform detection
export const isElectron = typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined'
export const isCapacitor = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined'
export const isWeb = !isElectron && !isCapacitor

// Clipboard interface
export interface ClipboardAPI {
  writeText(text: string): Promise<void>
  readText(): Promise<string>
  clear(): Promise<void>
}

// Biometric interface
export interface BiometricAPI {
  isAvailable(): Promise<boolean>
  authenticate(title: string, subtitle: string, reason: string): Promise<boolean>
}

// File System interface
export interface FileSystemAPI {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  readDir(path: string): Promise<string[]>
  deleteFile(path: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
}

// Dialog interface
export interface DialogAPI {
  showOpenDialog(options: { title: string; filters?: { name: string; extensions: string[] }[]; properties?: string[] }): Promise<{ filePaths: string[] }>
  showSaveDialog(options: { title: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ filePath: string }>
}

// Database interface
export interface DatabaseAPI {
  init(dbPath: string): Promise<void>
  run(sql: string, params?: any[]): Promise<void>
  query(sql: string, params?: any[]): Promise<any[]>
  close(): Promise<void>
  getDatabasePath(): string
}

// Platform bridge interface
export interface PlatformBridge {
  clipboard: ClipboardAPI
  biometric: BiometricAPI
  filesystem: FileSystemAPI
  dialog: DialogAPI
  database: DatabaseAPI
}

// Default implementations (will be overridden by platform-specific modules)
let platformBridge: PlatformBridge | null = null

export function setPlatformBridge(bridge: PlatformBridge): void {
  platformBridge = bridge
}

export function getPlatformBridge(): PlatformBridge {
  if (!platformBridge) {
    throw new Error('Platform bridge not initialized. Call setPlatformBridge() first.')
  }
  return platformBridge
}

// Convenience exports
export function getClipboard(): ClipboardAPI {
  return getPlatformBridge().clipboard
}

export function getBiometric(): BiometricAPI {
  return getPlatformBridge().biometric
}

export function getFileSystem(): FileSystemAPI {
  return getPlatformBridge().filesystem
}

export function getDialog(): DialogAPI {
  return getPlatformBridge().dialog
}

export function getDatabase(): DatabaseAPI {
  return getPlatformBridge().database
}
