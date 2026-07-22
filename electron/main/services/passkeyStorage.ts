// Passkey Storage Service
// Stores passkey credentials in the encrypted vault database

import { getDatabase, saveDatabase } from '../db/connection'
import { getActiveVaultId } from './vault.service'
import { queryAll, queryOne } from '../db/helpers'

export interface PasskeyCredential {
  id: string
  publicKey: string // Base64 encoded
  counter: number
  rpName: string
  rpId: string
  userName: string
  userDisplayName: string
  createdAt: number
}

// Create passkeys table if it doesn't exist
async function ensureTable(): Promise<any> {
  const db = await getDatabase()
  db.run(`
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      vault_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      rp_name TEXT NOT NULL,
      rp_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  return db
}

export async function savePasskey(credential: PasskeyCredential): Promise<void> {
  const db = await ensureTable()
  const vaultId = getActiveVaultId()

  db.run(
    `INSERT OR REPLACE INTO passkeys (id, vault_id, public_key, counter, rp_name, rp_id, user_name, user_display_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      credential.id,
      vaultId,
      credential.publicKey,
      credential.counter,
      credential.rpName,
      credential.rpId,
      credential.userName,
      credential.userDisplayName,
    ]
  )
  saveDatabase()
}

export async function getPasskey(credentialId: string): Promise<PasskeyCredential | null> {
  const db = await ensureTable()
  const vaultId = getActiveVaultId()

  const row = queryOne<any>(
    db,
    'SELECT * FROM passkeys WHERE id = ? AND vault_id = ?',
    [credentialId, vaultId]
  )
  if (!row) return null

  return {
    id: row.id,
    publicKey: row.public_key,
    counter: row.counter,
    rpName: row.rp_name,
    rpId: row.rp_id,
    userName: row.user_name,
    userDisplayName: row.user_display_name,
    createdAt: new Date(row.created_at).getTime(),
  }
}

export async function listPasskeys(): Promise<PasskeyCredential[]> {
  const db = await ensureTable()
  const vaultId = getActiveVaultId()

  const rows = queryAll<any>(
    db,
    'SELECT * FROM passkeys WHERE vault_id = ? ORDER BY created_at DESC',
    [vaultId]
  )

  return rows.map(row => ({
    id: row.id,
    publicKey: row.public_key,
    counter: row.counter,
    rpName: row.rp_name,
    rpId: row.rp_id,
    userName: row.user_name,
    userDisplayName: row.user_display_name,
    createdAt: new Date(row.created_at).getTime(),
  }))
}

export async function deletePasskey(credentialId: string): Promise<boolean> {
  const db = await ensureTable()
  const vaultId = getActiveVaultId()

  db.run('DELETE FROM passkeys WHERE id = ? AND vault_id = ?', [credentialId, vaultId])
  saveDatabase()
  return true
}

export async function updatePasskeyCounter(credentialId: string, counter: number): Promise<boolean> {
  const db = await ensureTable()
  const vaultId = getActiveVaultId()

  db.run(
    'UPDATE passkeys SET counter = ? WHERE id = ? AND vault_id = ?',
    [counter, credentialId, vaultId]
  )
  saveDatabase()
  return true
}
