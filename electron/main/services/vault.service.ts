import { getDatabase, saveDatabase } from '../db/connection'
import { getVault, createVault, updateMasterHash, updateTOTP, updateAlarm } from '../db/queries/vault.queries'
import { generateSalt, deriveKey, computeVerificationHash, splitDerivedKey } from '../crypto/keyderivation'
import { encrypt, decrypt } from '../crypto/encryption'
import { generateSecret, verifyTOTP, generateQRCodeUrl } from '../crypto/totp'
import { RATE_LIMIT } from '../crypto/constants'
import type { Buffer } from 'buffer'

// Held in memory ONLY — never written to disk
let derivedKey: Buffer | null = null
let autoLockTimer: ReturnType<typeof setTimeout> | null = null
let alarmMode = false

// Pending TOTP secret (set during enableTOTP, used during verifyAndSaveTOTP)
let pendingTotpSecret: string | null = null

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
  db.run('INSERT INTO unlock_attempts (success) VALUES (?)', [success ? 1 : 0])
}

function getRequiredDelay(db: any): number {
  const attempts = getRecentFailedAttempts(db)
  if (attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_LOCK) return -1
  if (attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_DELAY_3) return RATE_LIMIT.DELAY_3_MS
  if (attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_DELAY_2) return RATE_LIMIT.DELAY_2_MS
  if (attempts >= RATE_LIMIT.ATTEMPTS_BEFORE_DELAY_1) return RATE_LIMIT.DELAY_1_MS
  return 0
}

// ─── Vault Operations ───────────────────────────────────

export async function getVaultStatus() {
  const db = await getDatabase()
  const vault = getVault(db)
  return {
    locked: !isUnlocked(),
    initialized: !!vault,
  }
}

export async function setupVault(masterPassword: string, alarmPassword?: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase()
  const existing = getVault(db)
  if (existing) {
    return { success: false, error: 'Vault already initialized' }
  }

  const salt = generateSalt()
  const key = deriveKey(masterPassword, salt)
  const { encryptionKey } = splitDerivedKey(key)
  const masterHash = computeVerificationHash(encryptionKey)

  // Setup alarm password if provided
  let alarmHash: string | null = null
  let alarmSaltHex: string | null = null
  if (alarmPassword && alarmPassword.length > 0) {
    const aSalt = generateSalt()
    const aKey = deriveKey(alarmPassword, aSalt)
    const { encryptionKey: aEncKey } = splitDerivedKey(aKey)
    alarmHash = computeVerificationHash(aEncKey)
    alarmSaltHex = aSalt.toString('hex')
  }

  createVault(db, masterHash, salt.toString('hex'))

  // Set alarm password if provided
  if (alarmHash && alarmSaltHex) {
    updateAlarm(db, alarmHash, alarmSaltHex)
  }

  saveDatabase()

  // Unlock immediately after setup
  derivedKey = key
  alarmMode = false
  await startAutoLockTimer()

  return { success: true }
}

export async function unlockVault(
  masterPassword: string,
  totpCode?: string
): Promise<{ success: boolean; error?: string; requiresTotp?: boolean; alarmMode?: boolean }> {
  if (isUnlocked()) {
    return { success: false, error: 'Vault is already unlocked' }
  }

  const db = await getDatabase()

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

  const vault = getVault(db)
  if (!vault) {
    return { success: false, error: 'Vault not initialized' }
  }

  // Check master password
  const salt = Buffer.from(vault.kdf_salt, 'hex')
  const key = deriveKey(masterPassword, salt, vault.kdf_type as 'pbkdf2')
  const { encryptionKey } = splitDerivedKey(key)
  const computedHash = computeVerificationHash(encryptionKey)

  let isAlarm = false

  if (computedHash === vault.master_hash) {
    // Master password correct
    isAlarm = false
  } else if (vault.alarm_hash && vault.alarm_salt) {
    // Check alarm password
    const alarmSalt = Buffer.from(vault.alarm_salt, 'hex')
    const alarmKey = deriveKey(masterPassword, alarmSalt, vault.kdf_type as 'pbkdf2')
    const { encryptionKey: alarmEncKey } = splitDerivedKey(alarmKey)
    const alarmHash = computeVerificationHash(alarmEncKey)

    if (alarmHash === vault.alarm_hash) {
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
    const parts = vault.totp_secret.split(':')
    const decryptedSecret = decrypt(
      { iv: parts[0], ciphertext: parts[1], authTag: parts[2] },
      encryptionKey
    )
    if (!verifyTOTP(decryptedSecret, totpCode)) {
      recordAttempt(db, false)
      saveDatabase()
      return { success: false, error: 'Invalid TOTP code' }
    }
  }

  derivedKey = isAlarm ? null : key // In alarm mode, don't store real key
  alarmMode = isAlarm
  recordAttempt(db, true)
  saveDatabase()
  await startAutoLockTimer()

  return { success: true, alarmMode: isAlarm }
}

export function lockVault(): void {
  derivedKey = null
  alarmMode = false
  pendingTotpSecret = null
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}

export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
  totpCode?: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase()
  const vault = getVault(db)
  if (!vault) {
    return { success: false, error: 'Vault not initialized' }
  }

  // Verify TOTP if enabled
  if (vault.totp_enabled && vault.totp_secret) {
    if (!totpCode) {
      return { success: false, error: 'TOTP code required' }
    }
    const salt = Buffer.from(vault.kdf_salt, 'hex')
    const key = deriveKey(oldPassword, salt, vault.kdf_type as 'pbkdf2')
    const { encryptionKey: encKey } = splitDerivedKey(key)
    const parts = vault.totp_secret.split(':')
    const decryptedSecret = decrypt(
      { iv: parts[0], ciphertext: parts[1], authTag: parts[2] },
      encKey
    )
    if (!verifyTOTP(decryptedSecret, totpCode)) {
      return { success: false, error: 'Invalid TOTP code' }
    }
  }

  // Verify old password
  const oldSalt = Buffer.from(vault.kdf_salt, 'hex')
  const oldKey = deriveKey(oldPassword, oldSalt, vault.kdf_type as 'pbkdf2')
  const { encryptionKey: oldEncKey } = splitDerivedKey(oldKey)
  const oldHash = computeVerificationHash(oldEncKey)

  if (oldHash !== vault.master_hash) {
    return { success: false, error: 'Current password is incorrect' }
  }

  // Derive new key
  const newSalt = generateSalt()
  const newKey = deriveKey(newPassword, newSalt)
  const { encryptionKey: newEncKey } = splitDerivedKey(newKey)
  const newHash = computeVerificationHash(newEncKey)

  // Update vault
  updateMasterHash(db, newHash, newSalt.toString('hex'))

  // Re-encrypt TOTP secret if enabled
  if (vault.totp_enabled && vault.totp_secret) {
    const parts = vault.totp_secret.split(':')
    const decryptedSecret = decrypt(
      { iv: parts[0], ciphertext: parts[1], authTag: parts[2] },
      oldEncKey
    )
    const reEncrypted = encrypt(decryptedSecret, newEncKey)
    const reEncryptedStr = `${reEncrypted.iv}:${reEncrypted.ciphertext}:${reEncrypted.authTag}`
    updateTOTP(db, reEncryptedStr, true)
  }

  saveDatabase()
  derivedKey = newKey
  await startAutoLockTimer()

  return { success: true }
}

// ─── TOTP Management ────────────────────────────────────

export function enableTOTP(): { secret: string; qrCodeUrl: string } {
  const secret = generateSecret()
  const qrCodeUrl = generateQRCodeUrl(secret, 'CipherVault')
  // Store secret temporarily — will be saved after user verifies
  pendingTotpSecret = secret
  return { secret, qrCodeUrl }
}

export async function verifyAndSaveTOTP(code: string): Promise<boolean> {
  const encKey = getEncryptionKey()
  if (!encKey) return false

  // Must have a pending secret from enableTOTP
  if (!pendingTotpSecret) return false

  // Verify the code against the pending secret
  if (!verifyTOTP(pendingTotpSecret, code)) return false

  // Code is valid — encrypt and save the secret
  const encrypted = encrypt(pendingTotpSecret, encKey)
  const encryptedStr = `${encrypted.iv}:${encrypted.ciphertext}:${encrypted.authTag}`

  const db = await getDatabase()
  updateTOTP(db, encryptedStr, true)
  saveDatabase()

  pendingTotpSecret = null
  return true
}

export async function disableTOTP(totpCode: string): Promise<boolean> {
  const encKey = getEncryptionKey()
  if (!encKey) return false

  const db = await getDatabase()
  const vault = getVault(db)
  if (!vault || !vault.totp_secret) return false

  const parts = vault.totp_secret.split(':')
  const decryptedSecret = decrypt(
    { iv: parts[0], ciphertext: parts[1], authTag: parts[2] },
    encKey
  )

  if (!verifyTOTP(decryptedSecret, totpCode)) return false

  updateTOTP(db, null, false)
  saveDatabase()
  return true
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
  const encKey = getEncryptionKey()
  if (!encKey) return { success: false, error: 'Vault is locked' }

  const db = await getDatabase()
  const vault = getVault(db)
  if (!vault) return { success: false, error: 'Vault not initialized' }

  const salt = generateSalt()
  const key = deriveKey(alarmPassword, salt)
  const { encryptionKey } = splitDerivedKey(key)
  const alarmHash = computeVerificationHash(encryptionKey)

  updateAlarm(db, alarmHash, salt.toString('hex'))
  saveDatabase()

  return { success: true }
}

export async function changeAlarmPassword(oldAlarmPassword: string, newAlarmPassword: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase()
  const vault = getVault(db)
  if (!vault) return { success: false, error: 'Vault not initialized' }

  if (!vault.alarm_hash || !vault.alarm_salt) {
    return { success: false, error: 'Alarm password not set' }
  }

  // Verify old alarm password
  const oldSalt = Buffer.from(vault.alarm_salt, 'hex')
  const oldKey = deriveKey(oldAlarmPassword, oldSalt)
  const { encryptionKey: oldEncKey } = splitDerivedKey(oldKey)
  const oldHash = computeVerificationHash(oldEncKey)

  if (oldHash !== vault.alarm_hash) {
    return { success: false, error: 'Invalid alarm password' }
  }

  // Set new alarm password
  const newSalt = generateSalt()
  const newKey = deriveKey(newAlarmPassword, newSalt)
  const { encryptionKey: newEncKey } = splitDerivedKey(newKey)
  const newHash = computeVerificationHash(newEncKey)

  updateAlarm(db, newHash, newSalt.toString('hex'))
  saveDatabase()

  return { success: true }
}

export async function removeAlarmPassword(): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase()
  updateAlarm(db, null, null)
  saveDatabase()
  return { success: true }
}
