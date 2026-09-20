// ─── Electron DB Adapter ─────────────────────────────────
// Wraps sql.js database operations for use with shared vault logic

import { getDatabase } from './connection'
import { queryAll, queryOne } from './helpers'
import type { DBAdapter, VaultRow } from '../../../shared/vault/vaultAdapter'
import { getActiveVaultId as getActiveVaultIdFromService } from '../services/vault.service'

export const electronDBAdapter: DBAdapter = {
  async getVault(vaultId?: number) {
    const db = await getDatabase()
    const vid = vaultId ?? getActiveVaultIdFromService()
    const row = queryOne<VaultRow>(db, 'SELECT * FROM vault WHERE id = ?', [vid])
    return row ?? null
  },

  async getAllVaults() {
    const db = await getDatabase()
    return queryAll<VaultRow>(db, 'SELECT * FROM vault ORDER BY id ASC')
  },

  async createVault(kdfSalt, masterHash, verificationHash, displayName, alarmHash, alarmSalt) {
    const db = await getDatabase()
    db.run(
      'INSERT INTO vault (master_hash, kdf_salt, kdf_type, display_name, alarm_hash, alarm_salt) VALUES (?, ?, ?, ?, ?, ?)',
      [masterHash, kdfSalt, 'argon2id', displayName, alarmHash ?? null, alarmSalt ?? null]
    )
    const result = db.exec('SELECT last_insert_rowid() as id')
    return result[0]?.values[0][0] as number ?? 1
  },

  async updateMasterHash(vaultId, masterHash, verificationHash) {
    const db = await getDatabase()
    db.run(
      `UPDATE vault SET master_hash = ?, verification_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [masterHash, verificationHash, vaultId]
    )
  },

  async updateTOTP(vaultId, secret, enabled) {
    const db = await getDatabase()
    db.run(
      `UPDATE vault SET totp_secret = ?, totp_enabled = ?, updated_at = datetime('now') WHERE id = ?`,
      [secret, enabled ? 1 : 0, vaultId]
    )
  },

  async updateAlarm(vaultId, alarmHash, alarmSalt) {
    const db = await getDatabase()
    db.run(
      `UPDATE vault SET alarm_hash = ?, alarm_salt = ?, updated_at = datetime('now') WHERE id = ?`,
      [alarmHash, alarmSalt, vaultId]
    )
  },

  async updateDisplayName(vaultId, name) {
    const db = await getDatabase()
    db.run(
      `UPDATE vault SET display_name = ?, updated_at = datetime('now') WHERE id = ?`,
      [name, vaultId]
    )
  },

  async runQuery(sql: string, params?: unknown[]) {
    const db = await getDatabase()
    db.run(sql, params as any[])
  },

  async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    const db = await getDatabase()
    return queryOne<T>(db, sql, params as any[]) ?? null
  },

  async queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    const db = await getDatabase()
    return queryAll<T>(db, sql, params as any[])
  },

  async saveDatabase() {
    const { saveDatabase } = await import('./connection')
    saveDatabase()
  },

  async getSetting(key) {
    const db = await getDatabase()
    const result = db.exec('SELECT value FROM settings WHERE key = ?', [key])
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as string
    }
    return null
  },

  async setSetting(key, value) {
    const db = await getDatabase()
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value])
  },
}
