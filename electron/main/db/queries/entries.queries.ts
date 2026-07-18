import type { Database } from 'sql.js'
import type { EncryptedEntry, EntryFilters } from '../../../../shared/types'
import { queryAll, queryOne } from '../helpers'

export function getEntries(
  db: Database,
  filters?: EntryFilters,
  vaultId?: number
): EncryptedEntry[] {
  let query = 'SELECT * FROM encrypted_entries WHERE deleted_at IS NULL'
  const params: any[] = []

  // Always filter by vault_id (default to 1)
  query += ' AND vault_id = ?'
  params.push(vaultId ?? 1)

  if (filters) {
    if (filters.category_id !== undefined && filters.category_id !== null) {
      query += ' AND category_id = ?'
      params.push(filters.category_id)
    }
    if (filters.is_favorite !== undefined) {
      query += ' AND is_favorite = ?'
      params.push(filters.is_favorite ? 1 : 0)
    }
    if (filters.entry_type) {
      query += ' AND entry_type = ?'
      params.push(filters.entry_type)
    }
  }

  query += ' ORDER BY updated_at DESC'

  return queryAll<EncryptedEntry>(db, query, params)
}

export function getEntryById(
  db: Database,
  id: number
): EncryptedEntry | undefined {
  return queryOne<EncryptedEntry>(db, 'SELECT * FROM encrypted_entries WHERE id = ? AND deleted_at IS NULL', [id])
}

export function getEntryByIdIncludingDeleted(
  db: Database,
  id: number
): EncryptedEntry | undefined {
  return queryOne<EncryptedEntry>(db, 'SELECT * FROM encrypted_entries WHERE id = ?', [id])
}

export function getDeletedEntries(
  db: Database,
  vaultId?: number
): EncryptedEntry[] {
  let query = 'SELECT * FROM encrypted_entries WHERE deleted_at IS NOT NULL'
  const params: any[] = []

  if (vaultId !== undefined) {
    query += ' AND vault_id = ?'
    params.push(vaultId)
  }

  query += ' ORDER BY deleted_at DESC'

  return queryAll<EncryptedEntry>(db, query, params)
}

export function createEntry(
  db: Database,
  entryType: string,
  encryptedData: string,
  iv: string,
  authTag: string,
  displayTitle: string,
  categoryId: number | null = null,
  isFavorite: boolean = false,
  vaultId: number = 1
): EncryptedEntry {
  db.run(
    `INSERT INTO encrypted_entries (entry_type, encrypted_data, iv, auth_tag, display_title, category_id, is_favorite, vault_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entryType, encryptedData, iv, authTag, displayTitle, categoryId, isFavorite ? 1 : 0, vaultId]
  )

  const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  return getEntryById(db, lastId)!
}

export function updateEntry(
  db: Database,
  id: number,
  encryptedData: string,
  iv: string,
  authTag: string,
  displayTitle?: string
): void {
  if (displayTitle !== undefined) {
    db.run(
      `UPDATE encrypted_entries SET encrypted_data = ?, iv = ?, auth_tag = ?, display_title = ?, updated_at = datetime('now') WHERE id = ?`,
      [encryptedData, iv, authTag, displayTitle, id]
    )
  } else {
    db.run(
      `UPDATE encrypted_entries SET encrypted_data = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE id = ?`,
      [encryptedData, iv, authTag, id]
    )
  }
}

export function toggleFavorite(
  db: Database,
  id: number
): void {
  db.run(
    `UPDATE encrypted_entries SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?`,
    [id]
  )
}

export function deleteEntry(
  db: Database,
  id: number
): void {
  db.run(`UPDATE encrypted_entries SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id])
}

export function restoreEntry(
  db: Database,
  id: number
): void {
  db.run(`UPDATE encrypted_entries SET deleted_at = NULL WHERE id = ?`, [id])
}

export function permanentDeleteEntry(
  db: Database,
  id: number
): void {
  db.run('DELETE FROM encrypted_entries WHERE id = ?', [id])
}

export function permanentDeleteOldEntries(
  db: Database,
  daysOld: number = 30
): number {
  const countResult = db.exec(
    `SELECT COUNT(*) FROM encrypted_entries WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-' || ? || ' days')`,
    [daysOld]
  )
  const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0
  if (count > 0) {
    db.run(
      `DELETE FROM encrypted_entries WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-' || ? || ' days')`,
      [daysOld]
    )
  }
  return count
}

export function searchEntries(
  db: Database,
  query: string,
  vaultId?: number,
  filters?: EntryFilters
): EncryptedEntry[] {
  const escapedQuery = query.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')
  let sql = `SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ? AND (display_title LIKE ? ESCAPE '\\' OR entry_type LIKE ? ESCAPE '\\')`
  const params: any[] = [vaultId ?? 1, `%${escapedQuery}%`, `%${escapedQuery}%`]

  if (filters) {
    if (filters.category_id !== undefined && filters.category_id !== null) {
      sql += ' AND category_id = ?'
      params.push(filters.category_id)
    }
    if (filters.is_favorite !== undefined) {
      sql += ' AND is_favorite = ?'
      params.push(filters.is_favorite ? 1 : 0)
    }
    if (filters.entry_type) {
      sql += ' AND entry_type = ?'
      params.push(filters.entry_type)
    }
  }

  sql += ' ORDER BY updated_at DESC'

  return queryAll<EncryptedEntry>(db, sql, params)
}
