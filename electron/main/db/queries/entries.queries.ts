import type { Database } from 'sql.js'
import type { EncryptedEntry, EntryFilters } from '../../../shared/types'

function queryAll<T>(db: Database, sql: string, params: any[] = []): T[] {
  const result = db.exec(sql, params)
  if (result.length === 0) return []
  const columns = result[0].columns
  return result[0].values.map((row) => {
    const obj: any = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj as T
  })
}

function queryOne<T>(db: Database, sql: string, params: any[] = []): T | undefined {
  const rows = queryAll<T>(db, sql, params)
  return rows[0]
}

export function getEntries(
  db: Database,
  filters?: EntryFilters,
  vaultId?: number
): EncryptedEntry[] {
  let query = 'SELECT * FROM encrypted_entries WHERE 1=1'
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
  return queryOne<EncryptedEntry>(db, 'SELECT * FROM encrypted_entries WHERE id = ?', [id])
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
  db.run('DELETE FROM encrypted_entries WHERE id = ?', [id])
}

export function searchEntries(
  db: Database,
  query: string,
  vaultId?: number,
  filters?: EntryFilters
): EncryptedEntry[] {
  let sql = `SELECT * FROM encrypted_entries WHERE vault_id = ? AND (display_title LIKE ? OR entry_type LIKE ?)`
  const params: any[] = [vaultId ?? 1, `%${query}%`, `%${query}%`]

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
