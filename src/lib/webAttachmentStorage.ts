// Web/Capacitor attachment file storage — mirrors electron/main/db/attachmentStorage.ts.
// Files live under Directory.Data/attachments/*.enc. On Android this is the app's real
// native filesystem; in a plain browser, @capacitor/filesystem's web shim backs onto
// IndexedDB, so this works without any browser-specific fallback.
import { Filesystem, Directory } from '@capacitor/filesystem'

const ATTACHMENTS_DIR = 'attachments'

export function newStorageKey(): string {
  return crypto.randomUUID()
}

function pathForKey(storageKey: string): string {
  return `${ATTACHMENTS_DIR}/${storageKey}.enc`
}

// Write via temp file + rename so a crash mid-write can't leave a partial/corrupt attachment file.
export async function writeAttachmentFile(storageKey: string, data: Uint8Array): Promise<void> {
  const finalPath = pathForKey(storageKey)
  const tmpPath = finalPath + '.tmp'
  await Filesystem.writeFile({
    path: tmpPath,
    data: arrayToBase64(data),
    directory: Directory.Data,
    recursive: true,
  })
  await Filesystem.rename({
    from: tmpPath,
    to: finalPath,
    directory: Directory.Data,
  })
}

export async function readAttachmentFile(storageKey: string): Promise<Uint8Array> {
  const result = await Filesystem.readFile({
    path: pathForKey(storageKey),
    directory: Directory.Data,
  })
  return base64ToArray(result.data as string)
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: pathForKey(storageKey),
      directory: Directory.Data,
    })
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
