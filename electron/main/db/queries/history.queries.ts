import type { Database } from 'sql.js'
import { queryAll } from '../helpers'

export interface HistoryRow {
  id: number
  entry_id: number
  change_type: string
  changed_at: string
}

export function addHistoryEntry(
  db: Database,
  entryId: number,
  encryptedSnapshot: string,
  iv: string,
  authTag: string,
  changeType: string
): void {
  db.run(
    `INSERT INTO entry_history (entry_id, encrypted_snapshot, iv, auth_tag, change_type)
     VALUES (?, ?, ?, ?, ?)`,
    [entryId, encryptedSnapshot, iv, authTag, changeType]
  )
}

export function getEntryHistory(
  db: Database,
  entryId: number
): HistoryRow[] {
  return queryAll<HistoryRow>(
    db,
    `SELECT id, entry_id, change_type, changed_at
     FROM entry_history
     WHERE entry_id = ?
     ORDER BY changed_at DESC`,
    [entryId]
  )
}

export interface FullHistoryRow extends HistoryRow {
  encrypted_snapshot: string
  iv: string
  auth_tag: string
}

export function getFullEntryHistory(
  db: Database,
  entryId: number
): FullHistoryRow[] {
  return queryAll<FullHistoryRow>(
    db,
    `SELECT id, entry_id, encrypted_snapshot, iv, auth_tag, change_type, changed_at
     FROM entry_history
     WHERE entry_id = ?
     ORDER BY changed_at DESC`,
    [entryId]
  )
}
