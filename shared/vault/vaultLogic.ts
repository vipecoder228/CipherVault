// ─── Shared Vault Logic ──────────────────────────────────
// Platform-agnostic vault operations.
// Both Electron and Web backends delegate to these functions.

import type { VaultEnv, VaultRow, CryptoAdapter, DBAdapter } from './vaultAdapter'

// ─── State (per-context) ─────────────────────────────────
let derivedKey: Uint8Array | null = null
let activeVaultId = 1
let autoLockTimer: ReturnType<typeof setTimeout> | null = null
let pendingTotpSecret: string | null = null

// Panic mode state
let panicKey: Uint8Array | null = null
let panicMode = false
let panicKeyTimer: ReturnType<typeof setTimeout> | null = null

// Operation guard
let operationsInProgress = 0
let lockDeferred = false

export function isUnlocked(): boolean {
  return derivedKey !== null
}

export function getEncryptionKey(): Uint8Array | null {
  return derivedKey
}

export function getActiveVaultId(): number {
  return activeVaultId
}

export function isAlarmMode(): boolean {
  return panicMode
}

// ─── Helpers ─────────────────────────────────────────────
async function getRecentFailedAttempts(db: DBAdapter, vaultId: number): Promise<number> {
  const result = await db.queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM unlock_attempts WHERE vault_id = ? AND attempted_at > datetime('now', '-5 minutes')",
    [vaultId]
  )
  return result?.cnt ?? 0
}

async function recordFailedAttempt(db: DBAdapter, vaultId: number): Promise<void> {
  await db.runQuery(
    "INSERT INTO unlock_attempts (vault_id, attempted_at) VALUES (?, datetime('now'))",
    [vaultId]
  )
}

async function clearFailedAttempts(db: DBAdapter, vaultId: number): Promise<void> {
  await db.runQuery("DELETE FROM unlock_attempts WHERE vault_id = ?", [vaultId])
}

async function cleanupOldAttempts(db: DBAdapter): Promise<void> {
  await db.runQuery("DELETE FROM unlock_attempts WHERE attempted_at < datetime('now', '-5 minutes')")
}

function acquireOperation(): boolean {
  operationsInProgress++
  if (lockDeferred) {
    lockDeferred = false
    return false
  }
  return true
}

function releaseOperation(): void {
  operationsInProgress = Math.max(0, operationsInProgress - 1)
  if (operationsInProgress === 0 && lockDeferred) {
    lockDeferred = false
  }
}

function startAutoLockTimerImpl(db: DBAdapter): void {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
  db.getSetting('auto_lock_ms').then((val) => {
    const ms = parseInt(val || '0', 10)
    if (ms > 0 && derivedKey) {
      autoLockTimer = setTimeout(() => {
        if (derivedKey) {
          clearKey()
          // Lock logic delegated to caller
        }
      }, ms)
    }
  })
}

function resetAutoLockTimerImpl(db: DBAdapter): void {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
  startAutoLockTimerImpl(db)
}

function clearKey(): void {
  if (derivedKey) {
    derivedKey.fill(0)
    derivedKey = null
  }
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}

function clearPanicKey(): void {
  if (panicKeyTimer) {
    clearTimeout(panicKeyTimer)
    panicKeyTimer = null
  }
  if (panicKey) {
    panicKey.fill(0)
    panicKey = null
  }
  panicMode = false
}

// ─── Vault Operations ────────────────────────────────────

export async function getVaultStatus(env: VaultEnv) {
  const vault = await env.db.getVault()
  if (!vault) {
    return { initialized: false, unlocked: false, displayName: '' }
  }
  const allVaults = await env.db.getAllVaults()
  return {
    initialized: true,
    unlocked: isUnlocked(),
    displayName: vault.display_name,
    totpEnabled: !!vault.totp_enabled,
    alarmEnabled: !!vault.alarm_hash,
    vaultCount: allVaults.length,
  }
}

export async function setupVault(
  env: VaultEnv,
  masterPassword: string,
  alarmPassword?: string,
  displayName?: string
) {
  const existingVault = await env.db.getVault()
  if (existingVault) {
    return { success: false, error: 'Vault already exists' }
  }

  const salt = env.crypto.generateSalt()
  const derived = await env.crypto.deriveKey(masterPassword, salt)
  const { encryptionKey: encKey, hmacKey } = env.crypto.splitDerivedKey(derived)
  const hash = await env.crypto.computeVerificationHash(encKey)

  let alarmHash: string | undefined
  let alarmSaltHex: string | undefined
  if (alarmPassword) {
    const aSalt = env.crypto.generateSalt()
    const aKey = await env.crypto.deriveKey(alarmPassword, aSalt)
    const { encryptionKey: aEncKey } = env.crypto.splitDerivedKey(aKey)
    alarmHash = await env.crypto.computeVerificationHash(aEncKey)
    alarmSaltHex = Buffer.from(aSalt).toString('hex')
  }

  const vaultId = await env.db.createVault(
    Buffer.from(salt).toString('hex'),
    hash,
    hash,
    displayName || 'Main Vault',
    alarmHash,
    alarmSaltHex
  )

  derivedKey = encKey
  activeVaultId = vaultId
  startAutoLockTimerImpl(env.db)

  return { success: true }
}

export async function unlockVault(
  env: VaultEnv,
  masterPassword: string,
  totpCode?: string,
  vaultId?: number
) {
  await cleanupOldAttempts(env.db)

  const vid = vaultId || activeVaultId
  const vault = await env.db.getVault(vid)
  if (!vault) {
    return { success: false, error: 'Vault not found' }
  }

  const failedAttempts = await getRecentFailedAttempts(env.db, vid)
  if (failedAttempts >= 10) {
    return { success: false, error: 'Too many failed attempts. Try again later.' }
  }

  const salt = Buffer.from(vault.kdf_salt, 'hex')
  const kdfType = vault.kdf_type as 'argon2id' | 'pbkdf2' | undefined
  const derived = await env.crypto.deriveKey(masterPassword, salt, kdfType)
  const { encryptionKey: encKey } = env.crypto.splitDerivedKey(derived)

  const computedHash = await env.crypto.computeVerificationHash(encKey)
  if (!env.crypto.timingSafeEqual(computedHash, vault.master_hash)) {
    await recordFailedAttempt(env.db, vid)
    const remaining = 10 - (failedAttempts + 1)
    return {
      success: false,
      error: remaining > 0
        ? `Incorrect password. ${remaining} attempts remaining.`
        : 'Too many failed attempts. Vault locked for 5 minutes.'
    }
  }

  await clearFailedAttempts(env.db, vid)
  derivedKey = encKey
  activeVaultId = vid

  if (vault.totp_enabled && vault.totp_secret) {
    if (!totpCode) {
      return { success: false, needsTOTP: true }
    }
    const parsed = JSON.parse(vault.totp_secret)
    const totpPayload = { iv: parsed.iv, ciphertext: parsed.ciphertext, authTag: parsed.authTag }
    const totpSecret = await env.crypto.decryptJSON<string>(totpPayload, encKey)
    const valid = await env.crypto.verifyTOTP(totpSecret, totpCode)
    if (!valid) {
      clearKey()
      return { success: false, error: 'Invalid TOTP code' }
    }
  }

  startAutoLockTimerImpl(env.db)
  return { success: true }
}

export function lockVault(env: VaultEnv) {
  if (!acquireOperation()) {
    lockDeferred = true
    return { success: false, deferred: true }
  }
  try {
    clearKey()
    clearPanicKey()
    env.clipboard.clear()
    env.emitEvent?.('webvault:locked')
    return { success: true }
  } finally {
    releaseOperation()
  }
}

export async function switchVault(env: VaultEnv, vaultId: number) {
  const vault = await env.db.getVault(vaultId)
  if (!vault) return { success: false, error: 'Vault not found' }
  activeVaultId = vaultId
  return { success: true }
}

export async function verifyPassword(env: VaultEnv, password: string) {
  const vault = await env.db.getVault(activeVaultId)
  if (!vault) return false
  const salt = Buffer.from(vault.kdf_salt, 'hex')
  const kdfType = vault.kdf_type as 'argon2id' | 'pbkdf2' | undefined
  const derived = await env.crypto.deriveKey(password, salt, kdfType)
  const { encryptionKey: encKey } = env.crypto.splitDerivedKey(derived)
  const hash = await env.crypto.computeVerificationHash(encKey)
  return env.crypto.timingSafeEqual(hash, vault.master_hash)
}

export async function enableTOTP(env: VaultEnv) {
  if (pendingTotpSecret) return { error: 'TOTP setup already in progress' }
  const secret = env.crypto.generateTOTPSecret()
  const qrCodeUrl = env.crypto.generateQRCodeUrl(secret, 'CipherVault')
  pendingTotpSecret = secret
  return { secret, qrCodeUrl }
}

export async function verifyAndSaveTOTP(env: VaultEnv, code: string) {
  if (!derivedKey) return false
  if (!pendingTotpSecret) return false
  const valid = await env.crypto.verifyTOTP(pendingTotpSecret, code)
  if (!valid) return false

  const encrypted = await env.crypto.encryptJSON(pendingTotpSecret, derivedKey)
  await env.db.updateTOTP(activeVaultId, JSON.stringify(encrypted), true)
  await env.db.saveDatabase()
  pendingTotpSecret = null
  return true
}

export async function disableTOTP(env: VaultEnv, totpCode: string) {
  if (!derivedKey) return false
  const vault = await env.db.getVault(activeVaultId)
  if (!vault || !vault.totp_secret) return false
  const parsed = JSON.parse(vault.totp_secret)
  const totpPayload = { iv: parsed.iv, ciphertext: parsed.ciphertext, authTag: parsed.authTag }
  const totpSecret = await env.crypto.decryptJSON<string>(totpPayload, derivedKey)
  const valid = await env.crypto.verifyTOTP(totpSecret, totpCode)
  if (!valid) return false
  await env.db.updateTOTP(activeVaultId, null, false)
  await env.db.saveDatabase()
  return true
}

export async function setupAlarmPassword(env: VaultEnv, alarmPassword: string) {
  if (!derivedKey) return { success: false, error: 'Vault is locked' }
  const salt = env.crypto.generateSalt()
  const derived = await env.crypto.deriveKey(alarmPassword, salt)
  const { encryptionKey: encKey } = env.crypto.splitDerivedKey(derived)
  const hash = await env.crypto.computeVerificationHash(encKey)
  await env.db.updateAlarm(activeVaultId, hash, Buffer.from(salt).toString('hex'))
  await env.db.saveDatabase()
  return { success: true }
}

export async function changeAlarmPassword(env: VaultEnv, oldAlarm: string, newAlarm: string) {
  if (!acquireOperation()) return { success: false, error: 'Operation in progress' }
  try {
    const vault = await env.db.getVault(activeVaultId)
    if (!vault || !vault.alarm_hash || !vault.alarm_salt) {
      return { success: false, error: 'No alarm password set' }
    }
    const oldSalt = Buffer.from(vault.alarm_salt, 'hex')
    const oldDerived = await env.crypto.deriveKey(oldAlarm, oldSalt)
    const { encryptionKey: oldEncKey } = env.crypto.splitDerivedKey(oldDerived)
    const oldHash = await env.crypto.computeVerificationHash(oldEncKey)
    if (!env.crypto.timingSafeEqual(oldHash, vault.alarm_hash)) {
      return { success: false, error: 'Incorrect current alarm password' }
    }
    const newSalt = env.crypto.generateSalt()
    const newDerived = await env.crypto.deriveKey(newAlarm, newSalt)
    const { encryptionKey: newEncKey } = env.crypto.splitDerivedKey(newDerived)
    const newHash = await env.crypto.computeVerificationHash(newEncKey)
    await env.db.updateAlarm(activeVaultId, newHash, Buffer.from(newSalt).toString('hex'))
    await env.db.saveDatabase()
    return { success: true }
  } finally {
    releaseOperation()
  }
}

export async function removeAlarmPassword(env: VaultEnv) {
  await env.db.updateAlarm(activeVaultId, null, null)
  await env.db.saveDatabase()
  return { success: true }
}

export function resetAutoLockTimer(env: VaultEnv) {
  resetAutoLockTimerImpl(env.db)
}

// ─── Cleanup ─────────────────────────────────────────────
export function resetVaultState(): void {
  clearKey()
  clearPanicKey()
  pendingTotpSecret = null
  operationsInProgress = 0
  lockDeferred = false
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}
