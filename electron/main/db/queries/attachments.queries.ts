import type { Database } from 'sql.js'
import type { AttachmentMeta } from '../../../../shared/types'
import { queryAll, queryOne } from '../helpers'

export function getAttachmentsForEntry(db: Database, entryId: number): AttachmentMeta[] {
  return queryAll<AttachmentMeta>(
    db,
    'SELECT id, entry_id, storage_key, filename, mime_type, size, created_at FROM attachments WHERE entry_id = ? ORDER BY created_at ASC',
    [entryId]
  )
}

export function getAttachmentById(db: Database, id: number): (AttachmentMeta & { iv: string; auth_tag: string }) | undefined {
  return queryOne(db, 'SELECT * FROM attachments WHERE id = ?', [id])
}

export function createAttachment(
  db: Database,
  entryId: number,
  storageKey: string,
  filename: string,
  mimeType: string,
  size: number,
  iv: string,
  authTag: string
): AttachmentMeta {
  db.run(
    `INSERT INTO attachments (entry_id, storage_key, filename, mime_type, size, iv, auth_tag)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entryId, storageKey, filename, mimeType, size, iv, authTag]
  )
  const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  return queryOne<AttachmentMeta>(
    db,
    'SELECT id, entry_id, storage_key, filename, mime_type, size, created_at FROM attachments WHERE id = ?',
    [lastId]
  )!
}

export function deleteAttachment(db: Database, id: number): void {
  db.run('DELETE FROM attachments WHERE id = ?', [id])
}

export function getAttachmentsForVault(db: Database, vaultId: number): Array<AttachmentMeta & { iv: string; auth_tag: string }> {
  return queryAll(
    db,
    `SELECT a.* FROM attachments a
     JOIN encrypted_entries e ON a.entry_id = e.id
     WHERE e.vault_id = ?`,
    [vaultId]
  )
}

// Storage keys for an entry's attachments, or for all deleted (soft-deleted, past
// the retention window) entries' attachments — read BEFORE the entry row is
// permanently deleted, since the FK's ON DELETE CASCADE removes the attachment
// rows (and with them the only record of which files to clean up from disk).
export function getStorageKeysForEntry(db: Database, entryId: number): string[] {
  return queryAll<{ storage_key: string }>(
    db,
    'SELECT storage_key FROM attachments WHERE entry_id = ?',
    [entryId]
  ).map(r => r.storage_key)
}

export function getStorageKeysForDeletedEntries(db: Database, daysOld: number): string[] {
  return queryAll<{ storage_key: string }>(
    db,
    `SELECT a.storage_key FROM attachments a
     JOIN encrypted_entries e ON a.entry_id = e.id
     WHERE e.deleted_at IS NOT NULL AND e.deleted_at < datetime('now', '-' || ? || ' days')`,
    [daysOld]
  ).map(r => r.storage_key)
}

export function updateAttachmentEncryption(db: Database, id: number, iv: string, authTag: string): void {
  db.run('UPDATE attachments SET iv = ?, auth_tag = ? WHERE id = ?', [iv, authTag, id])
}
