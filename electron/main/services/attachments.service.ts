import { getDatabase, saveDatabase } from '../db/connection'
import {
  getAttachmentsForEntry,
  getAttachmentById,
  createAttachment as dbCreateAttachment,
  deleteAttachment as dbDeleteAttachment,
  getAttachmentsForVault,
  updateAttachmentEncryption,
} from '../db/queries/attachments.queries'
import { getEntryByIdIncludingDeleted } from '../db/queries/entries.queries'
import {
  newStorageKey,
  writeAttachmentFile,
  readAttachmentFile,
  deleteAttachmentFile,
} from '../db/attachmentStorage'
import { encryptBuffer, decryptBuffer } from '../crypto/encryption'
import { getEncryptionKey } from './vault.service'
import type { AttachmentMeta } from '../../../shared/types'

// Same per-file cap as Bitwarden's free tier — generous for the documents/photos
// this feature targets, small enough that a single attachment can't blow up
// vault-data/attachments/ or make sql.js's whole-DB export/save path (unrelated
// to attachments, but triggered on every entry edit) noticeably slower.
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024 // 25 MB
export const MAX_ATTACHMENTS_PER_ENTRY = 20

export async function listAttachments(entryId: number): Promise<AttachmentMeta[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []
  const db = await getDatabase()
  return getAttachmentsForEntry(db, entryId)
}

export async function addAttachment(
  entryId: number,
  filename: string,
  mimeType: string,
  data: Buffer
): Promise<AttachmentMeta> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  if (data.length > MAX_ATTACHMENT_SIZE) {
    throw new Error(`Attachment exceeds maximum size of ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB`)
  }

  const db = await getDatabase()

  const entry = getEntryByIdIncludingDeleted(db, entryId)
  if (!entry) throw new Error('Entry not found')

  const existing = getAttachmentsForEntry(db, entryId)
  if (existing.length >= MAX_ATTACHMENTS_PER_ENTRY) {
    throw new Error(`An entry can have at most ${MAX_ATTACHMENTS_PER_ENTRY} attachments`)
  }

  const encrypted = encryptBuffer(data, encKey)
  const storageKey = newStorageKey()

  writeAttachmentFile(storageKey, encrypted.ciphertext)

  try {
    const meta = dbCreateAttachment(
      db,
      entryId,
      storageKey,
      filename,
      mimeType,
      data.length,
      encrypted.iv,
      encrypted.authTag
    )
    saveDatabase()
    return meta
  } catch (err) {
    // DB insert failed — don't leave an orphaned file on disk
    deleteAttachmentFile(storageKey)
    throw err
  }
}

export async function getAttachmentData(id: number): Promise<{ meta: AttachmentMeta; data: Buffer } | null> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const row = getAttachmentById(db, id)
  if (!row) return null

  const ciphertext = readAttachmentFile(row.storage_key)
  const data = decryptBuffer({ iv: row.iv, ciphertext, authTag: row.auth_tag }, encKey)

  return {
    meta: {
      id: row.id,
      entry_id: row.entry_id,
      storage_key: row.storage_key,
      filename: row.filename,
      mime_type: row.mime_type,
      size: row.size,
      created_at: row.created_at,
    },
    data,
  }
}

export async function deleteAttachmentById(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const row = getAttachmentById(db, id)
  if (!row) return

  dbDeleteAttachment(db, id)
  saveDatabase()
  deleteAttachmentFile(row.storage_key)
}

// Called from vault.service's changeMasterPassword flow, after entries/history
// have been re-encrypted with the new key but before the master hash is updated —
// same "all-or-nothing before commit" ordering as the rest of that flow.
// Scoped to vaultId since each vault has its own key — re-encrypting attachments
// belonging to other vaults with this vault's new key would corrupt them.
export async function reencryptVaultAttachments(vaultId: number, oldEncKey: Buffer, newEncKey: Buffer): Promise<void> {
  const db = await getDatabase()
  const rows = getAttachmentsForVault(db, vaultId)

  for (const row of rows) {
    const ciphertext = readAttachmentFile(row.storage_key)
    const plaintext = decryptBuffer({ iv: row.iv, ciphertext, authTag: row.auth_tag }, oldEncKey)
    const reEncrypted = encryptBuffer(plaintext, newEncKey)
    writeAttachmentFile(row.storage_key, reEncrypted.ciphertext)
    updateAttachmentEncryption(db, row.id, reEncrypted.iv, reEncrypted.authTag)
  }
}
