// Web/Tauri/Capacitor attachment file storage — mirrors electron/main/db/attachmentStorage.ts.
// Files live under app data/attachments/*.enc.
// On Android this is the app's real native filesystem; in a plain browser, the fs plugin's
// web shim backs onto IndexedDB, so this works without any browser-specific fallback.
import { isCapacitor, isTauri } from '../../shared/bridge'

const ATTACHMENTS_DIR = 'attachments'

export function newStorageKey(): string {
  return crypto.randomUUID()
}

function pathForKey(storageKey: string): string {
  return `${ATTACHMENTS_DIR}/${storageKey}.enc`
}

// Platform-specific filesystem helpers
async function fsWriteFileRaw(path: string, data: string): Promise<void> {
  if (isCapacitor || !isTauri) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({ path, data, directory: Directory.Data, recursive: true })
    return
  }
  if (isTauri) {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, data, { baseDir: BaseDirectory.AppData })
  }
}

async function fsRename(from: string, to: string): Promise<void> {
  if (isCapacitor || !isTauri) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.rename({ from, to, directory: Directory.Data })
    return
  }
  if (isTauri) {
    const { rename, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await rename(from, to, { baseDir: BaseDirectory.AppData })
  }
}

async function fsReadFileRaw(path: string): Promise<string> {
  if (isCapacitor || !isTauri) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const result = await Filesystem.readFile({ path, directory: Directory.Data })
    return result.data as string
  }
  if (isTauri) {
    const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(path, { baseDir: BaseDirectory.AppData })
  }
  throw new Error('No filesystem available')
}

async function fsDeleteFile(path: string): Promise<void> {
  if (isCapacitor || !isTauri) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.deleteFile({ path, directory: Directory.Data })
    return
  }
  if (isTauri) {
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await remove(path, { baseDir: BaseDirectory.AppData })
  }
}

// Write via temp file + rename so a crash mid-write can't leave a partial/corrupt attachment file.
export async function writeAttachmentFile(storageKey: string, data: Uint8Array): Promise<void> {
  const finalPath = pathForKey(storageKey)
  const tmpPath = finalPath + '.tmp'
  await fsWriteFileRaw(tmpPath, arrayToBase64(data))
  await fsRename(tmpPath, finalPath)
}

export async function readAttachmentFile(storageKey: string): Promise<Uint8Array> {
  const b64 = await fsReadFileRaw(pathForKey(storageKey))
  return base64ToArray(b64)
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  try {
    await fsDeleteFile(pathForKey(storageKey))
  } catch {
    // Already gone — nothing to clean up
  }
}

function arrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArray(b64: string): Uint8Array {
  const binaryString = atob(b64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
