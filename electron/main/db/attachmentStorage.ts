import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getDatabasePath } from './connection'

export function getAttachmentsDir(): string {
  const vaultDir = join(getDatabasePath(), '..')
  const attachmentsDir = join(vaultDir, 'attachments')
  if (!existsSync(attachmentsDir)) {
    mkdirSync(attachmentsDir, { recursive: true })
  }
  return attachmentsDir
}

export function newStorageKey(): string {
  return randomUUID()
}

function pathForKey(storageKey: string): string {
  return join(getAttachmentsDir(), `${storageKey}.enc`)
}

// Write via temp file + rename so a crash mid-write can't leave a partial/corrupt attachment file.
export function writeAttachmentFile(storageKey: string, data: Buffer): void {
  const finalPath = pathForKey(storageKey)
  const tmpPath = finalPath + '.tmp'
  writeFileSync(tmpPath, data)
  renameSync(tmpPath, finalPath)
}

export function readAttachmentFile(storageKey: string): Buffer {
  return readFileSync(pathForKey(storageKey))
}

export function deleteAttachmentFile(storageKey: string): void {
  const filePath = pathForKey(storageKey)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
