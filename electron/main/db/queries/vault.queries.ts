import type { Database } from 'sql.js'
import { queryAll, queryOne } from '../helpers'

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
  display_name: string
  auto_lock_ms: number
  created_at: string
  updated_at: string
}

export function getVault(db: Database, vaultId: number = 1): VaultRow | undefined {
  return queryOne<VaultRow>(db, 'SELECT * FROM vault WHERE id = ?', [vaultId])
}

export function getAllVaults(db: Database): VaultRow[] {
  return queryAll<VaultRow>(db, 'SELECT * FROM vault ORDER BY id ASC')
}

export function createVault(
  db: Database,
  masterHash: string,
  kdfSalt: string,
  kdfType: string = 'argon2id'
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
  kdfType: string = 'argon2id',
  vaultId: number = 1
): void {
  db.run(
    `UPDATE vault SET master_hash = ?, kdf_salt = ?, kdf_type = ?, updated_at = datetime('now') WHERE id = ?`,
    [masterHash, kdfSalt, kdfType, vaultId]
  )
}

export function updateTOTP(
  db: Database,
  totpSecret: string | null,
  totpEnabled: boolean,
  vaultId: number = 1
): void {
  db.run(
    `UPDATE vault SET totp_secret = ?, totp_enabled = ?, updated_at = datetime('now') WHERE id = ?`,
    [totpSecret, totpEnabled ? 1 : 0, vaultId]
  )
}

export function updateAlarm(
  db: Database,
  alarmHash: string | null,
  alarmSalt: string | null,
  vaultId: number = 1
): void {
  db.run(
    `UPDATE vault SET alarm_hash = ?, alarm_salt = ?, updated_at = datetime('now') WHERE id = ?`,
    [alarmHash, alarmSalt, vaultId]
  )
}
