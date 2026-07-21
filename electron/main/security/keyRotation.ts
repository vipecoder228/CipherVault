// ─── Key Rotation ───────────────────────────────────────
// Supports rotating encryption keys without re-encrypting all data

import { getDatabase } from '../db/connection'
import { getEntries, getEntryById } from '../db/queries/entries.queries'
import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { deriveKey, generateSalt, splitDerivedKey } from '../crypto/keyderivation'
import { getActiveVaultId } from '../services/vault.service'

interface KeyVersion {
  version: number
  salt: string
  created_at: string
}

/**
 * Get all key versions for a vault
 */
export async function getKeyVersions(vaultId: number): Promise<KeyVersion[]> {
  const db = await getDatabase()
  const result = db.exec(
    'SELECT version, salt, created_at FROM key_versions WHERE vault_id = ? ORDER BY version',
    [vaultId]
  )

  if (result.length === 0) return []

  return result[0].values.map((row) => ({
    version: row[0] as number,
    salt: row[1] as string,
    created_at: row[2] as string,
  }))
}

/**
 * Create a new key version (for key rotation)
 */
export async function createKeyVersion(
  vaultId: number,
  masterPassword: string
): Promise<{ version: number; oldKey: Buffer; newKey: Buffer }> {
  const db = await getDatabase()

  // Get current key version
  const versions = await getKeyVersions(vaultId)
  const currentVersion = versions.length > 0 ? versions[versions.length - 1].version : 0
  const newVersion = currentVersion + 1

  // Generate new salt
  const newSalt = generateSalt()

  // Derive new key
  const newDerivedKey = await deriveKey(masterPassword, newSalt)
  const { encryptionKey: newKey } = splitDerivedKey(newDerivedKey)

  // Get old salt
  const oldSalt = versions.length > 0
    ? Buffer.from(versions[versions.length - 1].salt, 'hex')
    : await getVaultSalt(vaultId)

  // Derive old key
  const oldDerivedKey = await deriveKey(masterPassword, oldSalt)
  const { encryptionKey: oldKey } = splitDerivedKey(oldDerivedKey)

  // Store new key version
  db.run(
    'INSERT INTO key_versions (vault_id, version, salt, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
    [vaultId, newVersion, newSalt.toString('hex')]
  )

  return { version: newVersion, oldKey, newKey }
}

/**
 * Re-encrypt all entries with a new key
 */
export async function reEncryptAllEntries(
  oldKey: Buffer,
  newKey: Buffer,
  vaultId: number
): Promise<{ reEncrypted: number; errors: number }> {
  const db = await getDatabase()
  const entries = getEntries(db, {}, vaultId)

  let reEncrypted = 0
  let errors = 0

  for (const entry of entries) {
    try {
      // Decrypt with old key
      const decrypted = decryptJSON(
        { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
        oldKey
      )

      // Re-encrypt with new key
      const reEncryptedData = encryptJSON(decrypted, newKey)

      // Update entry
      db.run(
        'UPDATE encrypted_entries SET encrypted_data = ?, iv = ?, auth_tag = ? WHERE id = ?',
        [reEncryptedData.ciphertext, reEncryptedData.iv, reEncryptedData.authTag, entry.id]
      )

      reEncrypted++
    } catch {
      errors++
    }
  }

  return { reEncrypted, errors }
}

async function getVaultSalt(vaultId: number): Promise<Buffer> {
  const db = await getDatabase()
  const result = db.exec('SELECT kdf_salt FROM vault WHERE id = ?', [vaultId])
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error('Vault not found')
  }
  return Buffer.from(result[0].values[0][0] as string, 'hex')
}
