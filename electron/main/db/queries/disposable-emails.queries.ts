import type { Database } from 'sql.js'
import { queryAll, queryOne } from '../helpers'

export interface DisposableEmailRow {
  id: number
  address: string
  password: string
  token: string | null
  account_id: string | null
  created_at: string
}

export function getDisposableEmails(db: Database): DisposableEmailRow[] {
  return queryAll<DisposableEmailRow>(db, 'SELECT * FROM disposable_emails ORDER BY created_at DESC')
}

export function getDisposableEmailById(db: Database, id: number): DisposableEmailRow | undefined {
  return queryOne<DisposableEmailRow>(db, 'SELECT * FROM disposable_emails WHERE id = ?', [id])
}

export function getDisposableEmailByAddress(db: Database, address: string): DisposableEmailRow | undefined {
  return queryOne<DisposableEmailRow>(db, 'SELECT * FROM disposable_emails WHERE address = ?', [address])
}

export function createDisposableEmail(
  db: Database,
  address: string,
  password: string,
  token: string | null = null,
  accountId: string | null = null
): DisposableEmailRow {
  db.run(
    'INSERT INTO disposable_emails (address, password, token, account_id) VALUES (?, ?, ?, ?)',
    [address, password, token, accountId]
  )
  const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  return getDisposableEmailById(db, lastId)!
}

export function updateDisposableEmailToken(
  db: Database,
  id: number,
  token: string,
  accountId: string | null = null
): void {
  db.run(
    'UPDATE disposable_emails SET token = ?, account_id = ? WHERE id = ?',
    [token, accountId, id]
  )
}

export function deleteDisposableEmail(db: Database, id: number): void {
  db.run('DELETE FROM disposable_emails WHERE id = ?', [id])
}
