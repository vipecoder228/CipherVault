import { getDatabase, saveDatabase } from '../db/connection'
import { getVault, getAllVaults, createVault, updateMasterHash, updateTOTP, updateAlarm } from '../db/queries/vault.queries'
import { generateSalt, deriveKey, computeVerificationHash, splitDerivedKey } from '../crypto/keyderivation'
import { encrypt, decrypt, encryptJSON, decryptJSON } from '../crypto/encryption'
import { generateSecret, verifyTOTP, generateQRCodeUrl } from '../crypto/totp'
import { RATE_LIMIT } from '../crypto/constants'
import { timingSafeEqual } from 'crypto'

// Held in memory ONLY — never written to disk
let derivedKey: Buffer | null = null
let autoLockTimer: ReturnType<typeof setTimeout> | null = null
let alarmMode = false
let activeVaultId: number = 1
let operationCount = 0
let panicKey: Buffer | null = null // Temporary key for panic backup decryption

export function acquireOperation(): void { operationCount++ }
export function releaseOperation(): void { operationCount-- }

// Pending TOTP secret (set during enableTOTP, used during verifyAndSaveTOTP)
let pendingTotpSecret: string | null = null

// Safely parse an encrypted TOTP secret string into its parts
function parseTotpSecret(encrypted: string): { iv: string; ciphertext: string; authTag: string } | null {
  try {
    const parsed = JSON.parse(encrypted)
    if (parsed.iv && parsed.ciphertext && parsed.authTag) {
      return { iv: parsed.iv, ciphertext: parsed.ciphertext, authTag: parsed.authTag }
    }
    return null
  } catch {
    return null
  }
}

// Constant-time string comparison to prevent timing attacks
// Note: safeEqual is only used for fixed-length hex hashes
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  return timingSafeEqual(bufA, bufB)
}

// Clean up old unlock attempts (older than 5 minutes)
function cleanupOldAttempts(db: any): void {
  db.run(`DELETE FROM unlock_attempts WHERE attempted_at < datetime('now', '-5 minutes')`)
}

export function isUnlocked(): boolean {
  return derivedKey !== null
}

export function isAlarmMode(): boolean {
  return alarmMode
}

export function getEncryptionKey(): Buffer | null {
  if (!derivedKey) return null
  return splitDerivedKey(derivedKey).encryptionKey
}

export function getActiveVaultId(): number {
  return activeVaultId
}

export function getPanicEncryptionKey(): Buffer | null {
  if (!panicKey) return null
  return splitDerivedKey(panicKey).encryptionKey
}

export function clearPanicKey(): void {
  if (panicKey) {
    panicKey.fill(0)
  }
  panicKey = null
}

// ─── Rate Limiting ──────────────────────────────────────

function getRecentFailedAttempts(db: any): number {
  const result = db.exec(`
    SELECT COUNT(*) as count FROM unlock_attempts
    WHERE success = 0
    AND attempted_at > datetime('now', '-5 minutes')
  `)
  if (result.length === 0) return 0
  return result[0].values[0][0] as number
}

function recordAttempt(db: any, success: boolean): void {
  cleanupOldAttempts(db)
  db.run('INSERT INTO unlock_attempts (success) VALUES (?)', [success ? 1 : 0])
}

// ─── Vault Operations ───────────────────────────────────

export async function getVaultStatus() {
  const db = await getDatabase()
  const vault = getVault(db, activeVaultId)
  const allVaults = getAllVaults(db)
  return {
    locked: !isUnlocked(),
    initialized: !!vault,
    activeVaultId,
    vaults: allVaults.map(v => ({ id: v.id, displayName: v.display_name })),
  }
}

export async function setupVault(masterPassword: string, alarmPassword?: string, displayName?: string): Promise<{ success: boolean; error?: string; vaultId?: number }> {
  acquireOperation()
  try {
    const db = await getDatabase()

    // Find next available vault id
    const allVaults = getAllVaults(db)
    const existingIds = allVaults.map(v => v.id)
    let newVaultId = 1
    while (existingIds.includes(newVaultId)) {
      newVaultId++
    }

    // If this is the first vault, lock any other vaults first
    if (newVaultId === 1) {
      const firstVault = getVault(db, 1)
      if (firstVault) {
        return { success: false, error: 'Vault already initialized' }
      }
    }

    const salt = generateSalt()
    const key = await deriveKey(masterPassword, salt)
    const { encryptionKey } = splitDerivedKey(key)
    const masterHash = await computeVerificationHash(encryptionKey)

    // Setup alarm password if provided
    let alarmHash: string | null = null
    let alarmSaltHex: string | null = null
    if (alarmPassword && alarmPassword.length > 0) {
      const aSalt = generateSalt()
      const aKey = await deriveKey(alarmPassword, aSalt)
      const { encryptionKey: aEncKey } = splitDerivedKey(aKey)
      alarmHash = await computeVerificationHash(aEncKey)
      alarmSaltHex = aSalt.toString('hex')
    }

    createVault(db, masterHash, salt.toString('hex'))

    // Get the actual vault ID from SQLite
    const lastIdResult = db.exec('SELECT last_insert_rowid()')
    const actualVaultId = lastIdResult[0].values[0][0] as number

    // Set alarm password if provided
    if (alarmHash && alarmSaltHex) {
      updateAlarm(db, alarmHash, alarmSaltHex, actualVaultId)
    }

    // Update display name if provided
    if (displayName) {
      db.run('UPDATE vault SET display_name = ? WHERE id = ?', [displayName, actualVaultId])
    }

    saveDatabase()

    // Unlock immediately after setup
    derivedKey = key
    alarmMode = false
    activeVaultId = actualVaultId
    await startAutoLockTimer()

    return { success: true, vaultId: actualVaultId }
  } finally {
    releaseOperation()
  }
}

export async function unlockVault(
  masterPassword: string,
  totpCode?: string,
  vaultId?: number
): Promise<{ success: boolean; error?: string; requiresTotp?: boolean; alarmMode?: boolean }> {
  acquireOperation()
  try {
    if (isUnlocked()) {
      return { success: false, error: 'Vault is already unlocked' }
    }

    const db = await getDatabase()
    const targetVaultId = vaultId ?? activeVaultId

    const attempts = getRecentFailedAttempts(db)
    if (attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_LOCK) {
      return { success: false, error: 'Too many failed attempts. Please restart the application.' }
    }
    if (attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_DELAY_1) {
      const delay = attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_DELAY_3
        ? RATE_LIMIT.DELAY_3_MS
        : attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_DELAY_2
          ? RATE_LIMIT.DELAY_2_MS
          : RATE_LIMIT.DELAY_1_MS
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const vault = getVault(db, targetVaultId)
    if (!vault) {
      return { success: false, error: 'Vault not initialized' }
    }

    // Check master password
    const salt = Buffer.from(vault.kdf_salt, 'hex')
    const key = await deriveKey(masterPassword, salt)
    const { encryptionKey } = splitDerivedKey(key)
    const computedHash = await computeVerificationHash(encryptionKey)

    let isAlarm = false

    if (safeEqual(computedHash, vault.master_hash)) {
      // Master password correct
      isAlarm = false
    } else if (vault.alarm_hash && vault.alarm_salt) {
      // Check alarm password
      const alarmSalt = Buffer.from(vault.alarm_salt, 'hex')
      const alarmKey = await deriveKey(masterPassword, alarmSalt)
      const { encryptionKey: alarmEncKey } = splitDerivedKey(alarmKey)
      const alarmHash = await computeVerificationHash(alarmEncKey)

      if (safeEqual(alarmHash, vault.alarm_hash)) {
        // Alarm password correct — open empty vault
        isAlarm = true
      } else {
        // Neither password matches
        recordAttempt(db, false)
        saveDatabase()
        return { success: false, error: 'Invalid master password' }
      }
    } else {
      // No alarm password set, master password wrong
      recordAttempt(db, false)
      saveDatabase()
      return { success: false, error: 'Invalid master password' }
    }

    // Verify TOTP if enabled (skip in alarm mode for speed)
    if (!isAlarm && vault.totp_enabled && vault.totp_secret) {
      if (!totpCode) {
        return { success: false, error: 'TOTP code required', requiresTotp: true }
      }
      const parsed = parseTotpSecret(vault.totp_secret)
      if (!parsed) {
        return { success: false, error: 'TOTP configuration is corrupted' }
      }
      try {
        const decryptedSecret = decrypt(parsed, encryptionKey)
        if (!verifyTOTP(decryptedSecret, totpCode)) {
          recordAttempt(db, false)
          saveDatabase()
          return { success: false, error: 'Invalid TOTP code' }
        }
      } catch {
        return { success: false, error: 'TOTP configuration is corrupted' }
      }
    }

    derivedKey = isAlarm ? null : key // In alarm mode, don't store real key
    if (isAlarm) {
      panicKey = key
      setTimeout(() => { clearPanicKey() }, 300000) // Clear after 5 minutes
    } else {
      panicKey = null
    }
    alarmMode = isAlarm
    activeVaultId = targetVaultId
    recordAttempt(db, true)
    saveDatabase()
    await startAutoLockTimer()

    return { success: true, alarmMode: isAlarm }
  } finally {
    releaseOperation()
  }
}

export function lockVault(): void {
  // Defer lock if operation is in progress
  if (operationCount > 0) {
    if (autoLockTimer) clearTimeout(autoLockTimer)
    autoLockTimer = setTimeout(lockVault, 1000)
    return
  }
  // Zero the key buffer before releasing it
  if (derivedKey) {
    derivedKey.fill(0)
  }
  derivedKey = null
  clearPanicKey()
  alarmMode = false
  pendingTotpSecret = null
  // Don't reset activeVaultId — keep it for re-unlock
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}

export async function switchVault(vaultId: number): Promise<{ success: boolean; error?: string }> {
  if (isUnlocked()) {
    return { success: false, error: 'Lock the vault before switching' }
  }
  // Validate vault exists
  const db = await getDatabase()
  const vault = getVault(db, vaultId)
  if (!vault) {
    return { success: false, error: 'Vault not found' }
  }
  activeVaultId = vaultId
  return { success: true }
}

export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
  totpCode?: string
): Promise<{ success: boolean; error?: string }> {
  acquireOperation()
  try {
    if (!isUnlocked()) {
      return { success: false, error: 'Vault is locked' }
    }
    const db = await getDatabase()
    const vault = getVault(db, activeVaultId)
    if (!vault) {
      return { success: false, error: 'Vault not initialized' }
    }

    // Verify TOTP if enabled
    if (vault.totp_enabled && vault.totp_secret) {
      if (!totpCode) {
        return { success: false, error: 'TOTP code required' }
      }
      const salt = Buffer.from(vault.kdf_salt, 'hex')
      const key = await deriveKey(oldPassword, salt)
      const { encryptionKey: encKey } = splitDerivedKey(key)
      const parsed = parseTotpSecret(vault.totp_secret)
      if (!parsed) {
        return { success: false, error: 'TOTP configuration is corrupted' }
      }
      try {
        const decryptedSecret = decrypt(parsed, encKey)
        if (!verifyTOTP(decryptedSecret, totpCode)) {
          return { success: false, error: 'Invalid TOTP code' }
        }
      } catch {
        return { success: false, error: 'TOTP configuration is corrupted' }
      }
    }

    // Verify old password
    const oldSalt = Buffer.from(vault.kdf_salt, 'hex')
    const oldKey = await deriveKey(oldPassword, oldSalt)
    const { encryptionKey: oldEncKey } = splitDerivedKey(oldKey)
    const oldHash = await computeVerificationHash(oldEncKey)

    if (!safeEqual(oldHash, vault.master_hash)) {
      return { success: false, error: 'Current password is incorrect' }
    }

    // Derive new key
    const newSalt = generateSalt()
    const newKey = await deriveKey(newPassword, newSalt)
    const { encryptionKey: newEncKey } = splitDerivedKey(newKey)
    const newHash = await computeVerificationHash(newEncKey)

    // Re-encrypt TOTP secret if enabled (BEFORE updating master hash)
    if (vault.totp_enabled && vault.totp_secret) {
      const parsed = parseTotpSecret(vault.totp_secret)
      if (!parsed) {
        return { success: false, error: 'TOTP configuration is corrupted' }
      }
      try {
        const decryptedSecret = decrypt(parsed, oldEncKey)
        const reEncrypted = encrypt(decryptedSecret, newEncKey)
        const reEncryptedStr = JSON.stringify({ iv: reEncrypted.iv, ciphertext: reEncrypted.ciphertext, authTag: reEncrypted.authTag })
        updateTOTP(db, reEncryptedStr, true, activeVaultId)
      } catch {
        return { success: false, error: 'Failed to re-encrypt TOTP secret' }
      }
    }

    // Re-encrypt all entries with the new key
    const entries = db.exec(
      'SELECT id, encrypted_data, iv, auth_tag FROM encrypted_entries WHERE vault_id = ?',
      [activeVaultId]
    )
    if (entries.length > 0) {
      for (const row of entries[0].values) {
        const entryId = row[0] as number
        const encryptedData = row[1] as string
        const ivHex = row[2] as string
        const authTagHex = row[3] as string

        const decrypted = decryptJSON<Record<string, string>>(
          { iv: ivHex, ciphertext: encryptedData, authTag: authTagHex },
          oldEncKey
        )

        const reEncrypted = encryptJSON(decrypted, newEncKey)

        db.run(
          `UPDATE encrypted_entries SET encrypted_data = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE id = ?`,
          [reEncrypted.ciphertext, reEncrypted.iv, reEncrypted.authTag, entryId]
        )
      }

      // Re-encrypt history snapshots too
      const historyRows = db.exec(
        `SELECT h.id, h.encrypted_snapshot, h.iv, h.auth_tag
         FROM entry_history h
         JOIN encrypted_entries e ON h.entry_id = e.id
         WHERE e.vault_id = ?`,
        [activeVaultId]
      )
      if (historyRows.length > 0) {
        for (const row of historyRows[0].values) {
          const historyId = row[0] as number
          const snapshot = row[1] as string
          const ivHex = row[2] as string
          const authTagHex = row[3] as string

          try {
            const decrypted = decryptJSON<Record<string, string>>(
              { iv: ivHex, ciphertext: snapshot, authTag: authTagHex },
              oldEncKey
            )
            const reEncrypted = encryptJSON(decrypted, newEncKey)
            db.run(
              `UPDATE entry_history SET encrypted_snapshot = ?, iv = ?, auth_tag = ? WHERE id = ?`,
              [reEncrypted.ciphertext, reEncrypted.iv, reEncrypted.authTag, historyId]
            )
          } catch {
            // History snapshot may be corrupted — skip
          }
        }
      }
    }

    // Update master hash AFTER all re-encryption is complete
    updateMasterHash(db, newHash, newSalt.toString('hex'), 'pbkdf2', activeVaultId)

    saveDatabase()
    derivedKey = newKey
    await startAutoLockTimer()

    return { success: true }
  } finally {
    releaseOperation()
  }
}

// ─── TOTP Management ────────────────────────────────────

export function enableTOTP(): { secret: string; qrCodeUrl: string } | { error: string } {
  if (!isUnlocked()) return { error: 'Vault is locked' }
  if (pendingTotpSecret) return { error: 'TOTP setup already in progress' }
  const secret = generateSecret()
  const qrCodeUrl = generateQRCodeUrl(secret, 'CipherVault')
  pendingTotpSecret = secret
  return { secret, qrCodeUrl }
}

export async function verifyAndSaveTOTP(code: string): Promise<boolean> {
  acquireOperation()
  try {
    const encKey = getEncryptionKey()
    if (!encKey) return false

    // Must have a pending secret from enableTOTP
    if (!pendingTotpSecret) return false

    // Verify the code against the pending secret
    if (!verifyTOTP(pendingTotpSecret, code)) return false

    // Code is valid — encrypt and save the secret
    const encrypted = encrypt(pendingTotpSecret, encKey)
    const encryptedStr = JSON.stringify({ iv: encrypted.iv, ciphertext: encrypted.ciphertext, authTag: encrypted.authTag })

    const db = await getDatabase()
    updateTOTP(db, encryptedStr, true, activeVaultId)
    saveDatabase()

    pendingTotpSecret = null
    return true
  } finally {
    releaseOperation()
  }
}

export async function disableTOTP(totpCode: string): Promise<boolean> {
  acquireOperation()
  try {
    const encKey = getEncryptionKey()
    if (!encKey) return false

    const db = await getDatabase()
    const vault = getVault(db, activeVaultId)
    if (!vault || !vault.totp_secret) return false

    const parsed = parseTotpSecret(vault.totp_secret)
    if (!parsed) return false

    try {
      const decryptedSecret = decrypt(parsed, encKey)
      if (!verifyTOTP(decryptedSecret, totpCode)) return false
    } catch {
      return false
    }

    updateTOTP(db, null, false, activeVaultId)
    saveDatabase()
    return true
  } finally {
    releaseOperation()
  }
}

// ─── Auto Lock ──────────────────────────────────────────

async function getAutoLockMs(): Promise<number> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = 'auto_lock_ms'")
    if (result.length > 0 && result[0].values.length > 0) {
      return parseInt(result[0].values[0][0] as string, 10) || 300_000
    }
  } catch {}
  return 300_000
}

async function startAutoLockTimer(): Promise<void> {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
  }

  const timeoutMs = await getAutoLockMs()

  autoLockTimer = setTimeout(() => {
    lockVault()
  }, timeoutMs)
}

export async function resetAutoLockTimer(): Promise<void> {
  if (isUnlocked()) {
    await startAutoLockTimer()
  }
}

// ─── Alarm / Duress Code ────────────────────────────────

export async function setupAlarmPassword(alarmPassword: string): Promise<{ success: boolean; error?: string }> {
  acquireOperation()
  try {
    const encKey = getEncryptionKey()
    if (!encKey) return { success: false, error: 'Vault is locked' }

    const db = await getDatabase()
    const vault = getVault(db, activeVaultId)
    if (!vault) return { success: false, error: 'Vault not initialized' }

    const salt = generateSalt()
    const key = await deriveKey(alarmPassword, salt)
    const { encryptionKey } = splitDerivedKey(key)
    const alarmHash = await computeVerificationHash(encryptionKey)

    updateAlarm(db, alarmHash, salt.toString('hex'), activeVaultId)

    // Save alarm status to settings
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('alarm_enabled', 'true')")
    saveDatabase()

    return { success: true }
  } finally {
    releaseOperation()
  }
}

export async function changeAlarmPassword(oldAlarmPassword: string, newAlarmPassword: string): Promise<{ success: boolean; error?: string }> {
  acquireOperation()
  try {
    const db = await getDatabase()
    const vault = getVault(db, activeVaultId)
    if (!vault) return { success: false, error: 'Vault not initialized' }

    if (!vault.alarm_hash || !vault.alarm_salt) {
      return { success: false, error: 'Alarm password not set' }
    }

    // Verify old alarm password
    const oldSalt = Buffer.from(vault.alarm_salt, 'hex')
    const oldKey = await deriveKey(oldAlarmPassword, oldSalt)
    const { encryptionKey: oldEncKey } = splitDerivedKey(oldKey)
    const oldHash = await computeVerificationHash(oldEncKey)

    if (!safeEqual(oldHash, vault.alarm_hash)) {
      return { success: false, error: 'Invalid alarm password' }
    }

    // Set new alarm password
    const newSalt = generateSalt()
    const newKey = await deriveKey(newAlarmPassword, newSalt)
    const { encryptionKey: newEncKey } = splitDerivedKey(newKey)
    const newHash = await computeVerificationHash(newEncKey)

    updateAlarm(db, newHash, newSalt.toString('hex'), activeVaultId)
    saveDatabase()

    return { success: true }
  } finally {
    releaseOperation()
  }
}

export async function removeAlarmPassword(): Promise<{ success: boolean; error?: string }> {
  acquireOperation()
  try {
    const db = await getDatabase()
    updateAlarm(db, null, null, activeVaultId)

    // Save alarm status to settings
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('alarm_enabled', 'false')")
    saveDatabase()

    return { success: true }
  } finally {
    releaseOperation()
  }
}
