import type { Database } from 'sql.js'

export interface VaultRow {
  id: number
  master_hash: string
  kdf_salt: string
  kdf_type: string
  kdf_ops: number
  totp_secret: string | null
  totp_enabled: number
  alarm_hash: string | null
  alarm_salt: string | null
  auto_lock_ms: number
  created_at: string
  updated_at: string
}

function queryOne<T>(db: Database, sql: string, params: any[] = []): T | undefined {
  const result = db.exec(sql, params)
  if (result.length === 0 || result[0].values.length === 0) return undefined
  const row = result[0].values[0]
  const columns = result[0].columns
  const obj: any = {}
  columns.forEach((col, i) => { obj[col] = row[i] })
  return obj as T
}

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

export function getVault(db: Database): VaultRow | undefined {
  return queryOne<VaultRow>(db, 'SELECT * FROM vault WHERE id = 1')
}

export function createVault(
  db: Database,
  masterHash: string,
  kdfSalt: string,
  kdfType: string = 'pbkdf2'
): void {
  db.run(
    'INSERT INTO vault (master_hash, kdf_salt, kdf_type) VALUES (?, ?, ?)',
    [masterHash, kdfSalt, kdfType]
  )
}

export function updateMasterHash(
  db: Database,
  masterHash: string,
  kdfSalt: string,
  kdfType: string = 'pbkdf2'
): void {
  db.run(
    `UPDATE vault SET master_hash = ?, kdf_salt = ?, kdf_type = ?, updated_at = datetime('now') WHERE id = 1`,
    [masterHash, kdfSalt, kdfType]
  )
}

export function updateTOTP(
  db: Database,
  totpSecret: string | null,
  totpEnabled: boolean
): void {
  db.run(
    `UPDATE vault SET totp_secret = ?, totp_enabled = ?, updated_at = datetime('now') WHERE id = 1`,
    [totpSecret, totpEnabled ? 1 : 0]
  )
}

export function updateAlarm(
  db: Database,
  alarmHash: string | null,
  alarmSalt: string | null
): void {
  db.run(
    `UPDATE vault SET alarm_hash = ?, alarm_salt = ?, updated_at = datetime('now') WHERE id = 1`,
    [alarmHash, alarmSalt]
  )
}
