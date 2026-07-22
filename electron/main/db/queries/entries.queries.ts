import type { Database } from 'sql.js'
import type { EncryptedEntry, EntryFilters } from '../../../../shared/types'
import { queryAll, queryOne } from '../helpers'
import { encryptMetadata, decryptMetadata } from '../../services/metadataEncryption'

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

  const entries = queryAll<EncryptedEntry>(db, query, params)

  // Decrypt metadata for display
  return entries.map(entry => ({
    ...entry,
    display_title: decryptMetadata(entry.display_title),
    display_url: decryptMetadata(entry.display_url),
  }))
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
  vaultId: number = 1,
  displayUrl: string = ''
): EncryptedEntry {
  // Encrypt metadata before storing
  const encTitle = encryptMetadata(displayTitle) ?? displayTitle
  const encUrl = encryptMetadata(displayUrl) ?? displayUrl

  db.run(
    `INSERT INTO encrypted_entries (entry_type, encrypted_data, iv, auth_tag, display_title, category_id, is_favorite, vault_id, display_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entryType, encryptedData, iv, authTag, encTitle, categoryId, isFavorite ? 1 : 0, vaultId, encUrl]
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
  displayTitle?: string,
  displayUrl?: string
): void {
  if (displayTitle !== undefined || displayUrl !== undefined) {
    const sets: string[] = ['encrypted_data = ?', 'iv = ?', 'auth_tag = ?', "updated_at = datetime('now')"]
    const params: any[] = [encryptedData, iv, authTag]
    if (displayTitle !== undefined) {
      sets.push('display_title = ?')
      params.push(encryptMetadata(displayTitle) ?? displayTitle)
    }
    if (displayUrl !== undefined) {
      sets.push('display_url = ?')
      params.push(encryptMetadata(displayUrl) ?? displayUrl)
    }
    params.push(id)
    db.run(`UPDATE encrypted_entries SET ${sets.join(', ')} WHERE id = ?`, params)
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
  // Since display_title is now encrypted, we can't use SQL LIKE.
  // Fetch all entries and filter in memory after decryption.
  let sql = `SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ?`
  const params: any[] = [vaultId ?? 1]

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

  const allEntries = queryAll<EncryptedEntry>(db, sql, params)

  // Filter by search query after decryption
  if (!query) return allEntries

  const lowerQuery = query.toLowerCase()
  return allEntries.filter(entry => {
    const title = decryptMetadata(entry.display_title).toLowerCase()
    const url = decryptMetadata(entry.display_url).toLowerCase()
    return title.includes(lowerQuery) || url.includes(lowerQuery) || entry.entry_type.toLowerCase().includes(lowerQuery)
  })
}
