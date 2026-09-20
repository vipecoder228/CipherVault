// Web/Capacitor attachments service — mirrors electron/main/services/attachments.service.ts.
import { getWebDatabase, saveWebDatabase, webQueryAll, webQueryOne, webRun } from './webDb'
import {
  newStorageKey,
  writeAttachmentFile,
  readAttachmentFile,
  deleteAttachmentFile,
} from './webAttachmentStorage'
import { encryptBytes, decryptBytes } from '../../shared/crypto/encryption'
import type { AttachmentMeta } from '../../shared/types'

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024 // 25 MB
export const MAX_ATTACHMENTS_PER_ENTRY = 20

function mapRow(row: any): AttachmentMeta {
  return {
    id: row.id,
    entry_id: row.entry_id,
    storage_key: row.storage_key,
    filename: row.filename,
    mime_type: row.mime_type,
    size: row.size,
    created_at: row.created_at,
  }
}

export async function listAttachments(entryId: number, encKey: Uint8Array | null): Promise<AttachmentMeta[]> {
  if (!encKey) return []
  await getWebDatabase()
  return webQueryAll<any>(
    'SELECT id, entry_id, storage_key, filename, mime_type, size, created_at FROM attachments WHERE entry_id = ? ORDER BY created_at ASC',
    [entryId]
  ).map(mapRow)
}

export async function addAttachment(
  entryId: number,
  filename: string,
  mimeType: string,
  data: Uint8Array,
  encKey: Uint8Array | null
): Promise<AttachmentMeta> {
  if (!encKey) throw new Error('Vault is locked')

  if (data.length > MAX_ATTACHMENT_SIZE) {
    throw new Error(`Attachment exceeds maximum size of ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB`)
  }

  await getWebDatabase()

  const entry = webQueryOne<any>('SELECT id FROM encrypted_entries WHERE id = ?', [entryId])
  if (!entry) throw new Error('Entry not found')

  const existing = webQueryAll<any>('SELECT id FROM attachments WHERE entry_id = ?', [entryId])
  if (existing.length >= MAX_ATTACHMENTS_PER_ENTRY) {
    throw new Error(`An entry can have at most ${MAX_ATTACHMENTS_PER_ENTRY} attachments`)
  }

  const encrypted = await encryptBytes(data, encKey)
  const storageKey = newStorageKey()

  await writeAttachmentFile(storageKey, encrypted.ciphertext)

  try {
    webRun(
      `INSERT INTO attachments (entry_id, storage_key, filename, mime_type, size, iv, auth_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entryId, storageKey, filename, mimeType, data.length, encrypted.iv, encrypted.authTag]
    )
    const row = webQueryOne<any>(
      'SELECT id, entry_id, storage_key, filename, mime_type, size, created_at FROM attachments WHERE storage_key = ?',
      [storageKey]
    )!
    await saveWebDatabase()
    return mapRow(row)
  } catch (err) {
    // DB insert failed — don't leave an orphaned file on disk
    await deleteAttachmentFile(storageKey)
    throw err
  }
}

export async function getAttachmentData(
  id: number,
  encKey: Uint8Array | null
): Promise<{ meta: AttachmentMeta; data: Uint8Array } | null> {
  if (!encKey) throw new Error('Vault is locked')

  await getWebDatabase()
  const row = webQueryOne<any>('SELECT * FROM attachments WHERE id = ?', [id])
  if (!row) return null

  const ciphertext = await readAttachmentFile(row.storage_key)
  const data = await decryptBytes({ iv: row.iv, ciphertext, authTag: row.auth_tag }, encKey)

  return { meta: mapRow(row), data }
}

export async function deleteAttachmentById(id: number, encKey: Uint8Array | null): Promise<void> {
  if (!encKey) throw new Error('Vault is locked')

  await getWebDatabase()
  const row = webQueryOne<any>('SELECT * FROM attachments WHERE id = ?', [id])
  if (!row) return

  webRun('DELETE FROM attachments WHERE id = ?', [id])
  await saveWebDatabase()
  await deleteAttachmentFile(row.storage_key)
}

// Storage keys for an entry's attachments — read BEFORE the entry row is permanently
// deleted, since the FK's ON DELETE CASCADE removes the attachment rows (and with them
// the only record of which files to clean up from disk).
export function getStorageKeysForEntry(entryId: number): string[] {
  return webQueryAll<{ storage_key: string }>(
    'SELECT storage_key FROM attachments WHERE entry_id = ?',
    [entryId]
  ).map(r => r.storage_key)
}

export function getStorageKeysForDeletedEntries(daysOld: number): string[] {
  return webQueryAll<{ storage_key: string }>(
    `SELECT a.storage_key FROM attachments a
     JOIN encrypted_entries e ON a.entry_id = e.id
     WHERE e.deleted_at IS NOT NULL AND e.deleted_at < datetime('now', '-' || ? || ' days')`,
    [daysOld]
  ).map(r => r.storage_key)
}

// Called from webBackend's changeMasterPassword/migrateVaultToArgon2id flows, after
// entries/history have been re-encrypted with the new key but before the master hash is
// updated — same "all-or-nothing before commit" ordering as the Electron equivalent.
// Scoped to vaultId since each vault has its own key — re-encrypting attachments
// belonging to other vaults with this vault's new key would corrupt them.
export async function reencryptVaultAttachments(
  vaultId: number,
  oldEncKey: Uint8Array,
  newEncKey: Uint8Array
): Promise<void> {
  const rows = webQueryAll<any>(
    `SELECT a.* FROM attachments a
     JOIN encrypted_entries e ON a.entry_id = e.id
     WHERE e.vault_id = ?`,
    [vaultId]
  )

  for (const row of rows) {
    const ciphertext = await readAttachmentFile(row.storage_key)
    const plaintext = await decryptBytes({ iv: row.iv, ciphertext, authTag: row.auth_tag }, oldEncKey)
    const reEncrypted = await encryptBytes(plaintext, newEncKey)
    await writeAttachmentFile(row.storage_key, reEncrypted.ciphertext)
    webRun('UPDATE attachments SET iv = ?, auth_tag = ? WHERE id = ?', [reEncrypted.iv, reEncrypted.authTag, row.id])
  }
}
