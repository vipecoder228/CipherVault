// Web/Capacitor backend — client-side IPC handler implementation
// Mirrors the Electron main process backend using Web APIs

import {
  getWebDatabase,
  saveWebDatabase,
  webQueryAll,
  webQueryOne,
  webRun,
} from './webDb'
import { encryptJSON, decryptJSON, encrypt } from '../../shared/crypto/encryption'
import {
  deriveKey,
  splitDerivedKey,
  computeVerificationHash,
  generateSalt,
} from '../../shared/crypto/keyderivation'
import { RATE_LIMIT } from '../../shared/crypto/constants'
import { mapColumns, mapEntryType } from '../../shared/importMapper'
import type {
  IPCChannels,
  VaultStatus,
  VaultSetupResult,
  VaultUnlockResult,
  EncryptedEntry,
  DecryptedEntry,
  CreateEntryPayload,
  UpdateEntryPayload,
  EntryFilters,
  Category,
  CreateCategoryPayload,
  PasswordOptions,
  PasswordHealth,
  PasswordHealthItem,
  EntryHistoryItem,
  ImportResult,
} from '../../shared/types'

// ─── State ──────────────────────────────────────────────

let derivedKey: Uint8Array | null = null
let autoLockTimer: ReturnType<typeof setTimeout> | null = null
let alarmMode = false
let activeVaultId = 1
let panicKey: Uint8Array | null = null

function isUnlocked(): boolean {
  return derivedKey !== null
}

function getEncryptionKey(): Uint8Array | null {
  if (!derivedKey) return null
  return splitDerivedKey(derivedKey).encryptionKey
}

function getPanicEncryptionKey(): Uint8Array | null {
  if (!panicKey) return null
  return splitDerivedKey(panicKey).encryptionKey
}

function clearPanicKey(): void {
  panicKey = null
}

// ─── Rate Limiting ──────────────────────────────────────

function cleanupOldAttempts(): void {
  webRun(`DELETE FROM unlock_attempts WHERE attempted_at < datetime('now', '-5 minutes')`)
}

function getRecentFailedAttempts(): number {
  const result = webQueryAll<{ count: number }>(
    `SELECT COUNT(*) as count FROM unlock_attempts WHERE success = 0 AND attempted_at > datetime('now', '-5 minutes')`
  )
  return result[0]?.count ?? 0
}

function recordAttempt(success: boolean): void {
  cleanupOldAttempts()
  webRun('INSERT INTO unlock_attempts (success) VALUES (?)', [success ? 1 : 0])
}

// ─── TOTP ──────────────────────────────────────────────

let pendingTotpSecret: string | null = null

function parseTotpSecret(encrypted: string): { iv: string; ciphertext: string; authTag: string } | null {
  const parts = encrypted.split(':')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null
  return { iv: parts[0], ciphertext: parts[1], authTag: parts[2] }
}

async function generateTOTPToken(secret: string): Promise<string> {
  // Dynamic import for otplib (works in browser)
  const { authenticator } = await import('otplib')
  return authenticator.generate(secret)
}

async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  const { authenticator } = await import('otplib')
  return authenticator.check(token, secret)
}

function generateSecret(): string {
  // Generate base32 secret
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  return Array.from({ length: 20 }, () => chars[unbiasedRandom(chars.length)]).join('')
}

function generateQRCodeUrl(secret: string, username: string = 'CipherVault'): string {
  return `otpauth://totp/${encodeURIComponent(username)}?secret=${secret}&issuer=CipherVault&algorithm=SHA1&digits=6&period=30`
}

// ─── Auto Lock ──────────────────────────────────────────

async function getAutoLockMs(): Promise<number> {
  try {
    const result = webQueryAll<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'auto_lock_ms'"
    )
    if (result.length > 0) {
      return parseInt(result[0].value, 10) || 300_000
    }
  } catch {}
  return 300_000
}

async function startAutoLockTimer(): Promise<void> {
  if (autoLockTimer) clearTimeout(autoLockTimer)
  const timeoutMs = await getAutoLockMs()
  autoLockTimer = setTimeout(() => {
    lockVault()
  }, timeoutMs)
}

function lockVault(): void {
  if (derivedKey) {
    // Zero out the key
    derivedKey.fill(0)
  }
  derivedKey = null
  clearPanicKey()
  alarmMode = false
  pendingTotpSecret = null
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
  // Notify the UI that vault is locked (web equivalent of Electron IPC event)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('webvault:locked'))
  }
}

// ─── Vault Operations ───────────────────────────────────

async function getVaultStatus(): Promise<VaultStatus> {
  await getWebDatabase()
  const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [activeVaultId])
  const allVaults = webQueryAll<any>('SELECT * FROM vault ORDER BY id ASC')
  return {
    locked: !isUnlocked(),
    initialized: !!vault,
    activeVaultId,
    vaults: allVaults.map((v: any) => ({ id: v.id, displayName: v.display_name })),
  }
}

async function setupVault(
  masterPassword: string,
  alarmPassword?: string,
  displayName?: string
): Promise<VaultSetupResult> {
  await getWebDatabase()

  const existingVault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [1])
  if (existingVault) {
    return { success: false, error: 'Vault already initialized' }
  }

  const salt = generateSalt()
  const key = await deriveKey(masterPassword, salt)
  const { encryptionKey } = splitDerivedKey(key)
  const masterHash = await computeVerificationHash(encryptionKey)

  webRun(
    'INSERT INTO vault (master_hash, kdf_salt, kdf_type) VALUES (?, ?, ?)',
    [masterHash, arrayToHex(salt), 'pbkdf2']
  )

  const lastIdResult = webQueryAll<any>('SELECT last_insert_rowid() as id')
  const actualVaultId = lastIdResult[0].id as number

  if (alarmPassword && alarmPassword.length > 0) {
    const aSalt = generateSalt()
    const aKey = await deriveKey(alarmPassword, aSalt)
    const { encryptionKey: aEncKey } = splitDerivedKey(aKey)
    const alarmHash = await computeVerificationHash(aEncKey)
    webRun(
      `UPDATE vault SET alarm_hash = ?, alarm_salt = ?, updated_at = datetime('now') WHERE id = ?`,
      [alarmHash, arrayToHex(aSalt), actualVaultId]
    )
  }

  if (displayName) {
    webRun('UPDATE vault SET display_name = ? WHERE id = ?', [displayName, actualVaultId])
  }

  await saveWebDatabase()

  derivedKey = key
  alarmMode = false
  activeVaultId = actualVaultId
  await startAutoLockTimer()

  return { success: true, vaultId: actualVaultId }
}

async function unlockVault(
  masterPassword: string,
  totpCode?: string,
  vaultId?: number
): Promise<VaultUnlockResult> {
  await getWebDatabase()

  if (isUnlocked()) {
    return { success: false, error: 'Vault is already unlocked' }
  }

  const targetVaultId = vaultId ?? activeVaultId
  const attempts = getRecentFailedAttempts()
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

  const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [targetVaultId])
  if (!vault) {
    return { success: false, error: 'Vault not initialized' }
  }

  const salt = hexToArray(vault.kdf_salt)
  const key = await deriveKey(masterPassword, salt)
  const { encryptionKey } = splitDerivedKey(key)
  const computedHash = await computeVerificationHash(encryptionKey)

  let isAlarm = false

  if (timingSafeStringEqual(computedHash, vault.master_hash)) {
    isAlarm = false
  } else if (vault.alarm_hash && vault.alarm_salt) {
    const alarmSalt = hexToArray(vault.alarm_salt)
    const alarmKey = await deriveKey(masterPassword, alarmSalt)
    const { encryptionKey: alarmEncKey } = splitDerivedKey(alarmKey)
    const alarmHash = await computeVerificationHash(alarmEncKey)

    if (timingSafeStringEqual(alarmHash, vault.alarm_hash)) {
      isAlarm = true
    } else {
      recordAttempt(false)
      await saveWebDatabase()
      return { success: false, error: 'Invalid master password' }
    }
  } else {
    recordAttempt(false)
    await saveWebDatabase()
    return { success: false, error: 'Invalid master password' }
  }

  if (!isAlarm && vault.totp_enabled && vault.totp_secret) {
    if (!totpCode) {
      return { success: false, error: 'TOTP code required', requiresTotp: true }
    }
    const parsed = parseTotpSecret(vault.totp_secret)
    if (!parsed) {
      return { success: false, error: 'TOTP configuration is corrupted' }
    }
    try {
      const decryptedSecret = await decryptJSON<string>(parsed, encryptionKey)
      if (!await verifyTOTP(decryptedSecret, totpCode)) {
        recordAttempt(false)
        await saveWebDatabase()
        return { success: false, error: 'Invalid TOTP code' }
      }
    } catch {
      return { success: false, error: 'TOTP configuration is corrupted' }
    }
  }

  derivedKey = isAlarm ? null : key
  panicKey = isAlarm ? key : null
  alarmMode = isAlarm
  activeVaultId = targetVaultId
  recordAttempt(true)
  await saveWebDatabase()
  await startAutoLockTimer()

  return { success: true, alarmMode: isAlarm }
}

// ─── Entry Operations ───────────────────────────────────

async function listEntries(filters?: EntryFilters): Promise<EncryptedEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []

  let query = 'SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ?'
  const params: any[] = [activeVaultId]

  if (filters) {
    if (filters.category_id !== undefined && filters.category_id !== null) {
      query += ' AND category_id = ?'
      params.push(filters.category_id)
    }
    if (filters.is_favorite !== undefined) {
      query += ' AND is_favorite = ?'
      params.push(filters.is_favorite ? 1 : 0)
    }
    if (filters.entry_type) {
      query += ' AND entry_type = ?'
      params.push(filters.entry_type)
    }
  }

  query += ' ORDER BY updated_at DESC'
  return webQueryAll<EncryptedEntry>(query, params)
}

async function getEntry(id: number): Promise<DecryptedEntry | null> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const row = webQueryOne<EncryptedEntry>(
    'SELECT * FROM encrypted_entries WHERE id = ? AND deleted_at IS NULL',
    [id]
  )
  if (!row) return null

  const decrypted = await decryptJSON<any>(
    { iv: row.iv, ciphertext: row.encrypted_data, authTag: row.auth_tag },
    encKey
  )
  decrypted.id = row.id
  decrypted.display_title = row.display_title
  decrypted.created_at = row.created_at
  decrypted.updated_at = row.updated_at
  return decrypted as DecryptedEntry
}

async function createEntry(data: CreateEntryPayload): Promise<EncryptedEntry> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const entryData = {
    title: data.title || '',
    username: data.username || '',
    password: data.password || '',
    url: data.url || '',
    notes: data.notes || '',
    totp_secret: data.totp_secret || '',
    card_number: data.card_number || '',
    card_holder: data.card_holder || '',
    card_expiry: data.card_expiry || '',
    card_cvv: data.card_cvv || '',
    identity_first_name: data.identity_first_name || '',
    identity_last_name: data.identity_last_name || '',
    identity_phone: data.identity_phone || '',
    identity_email: data.identity_email || '',
    identity_address: data.identity_address || '',
    identity_ssn: data.identity_ssn || '',
    identity_passport: data.identity_passport || '',
    identity_birthdate: data.identity_birthdate || '',
  }

  const encrypted = await encryptJSON(entryData, encKey)

  webRun(
    `INSERT INTO encrypted_entries (entry_type, encrypted_data, iv, auth_tag, display_title, category_id, is_favorite, vault_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.entry_type,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      // TODO: Consider encrypting display_title for additional metadata protection
      data.title || data.entry_type,
      data.category_id ?? null,
      data.is_favorite ? 1 : 0,
      activeVaultId,
    ]
  )

  const lastIdResult = webQueryAll<any>('SELECT last_insert_rowid() as id')
  const entryId = lastIdResult[0].id as number

  // Add history
  webRun(
    `INSERT INTO entry_history (entry_id, encrypted_snapshot, iv, auth_tag, change_type)
     VALUES (?, ?, ?, ?, 'create')`,
    [entryId, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
  )

  await saveWebDatabase()

  return webQueryOne<EncryptedEntry>('SELECT * FROM encrypted_entries WHERE id = ?', [entryId])!
}

async function updateEntry(id: number, data: UpdateEntryPayload): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const existing = webQueryOne<EncryptedEntry>(
    'SELECT * FROM encrypted_entries WHERE id = ?',
    [id]
  )
  if (!existing) throw new Error('Entry not found')

  const existingData = await decryptJSON<Record<string, string>>(
    { iv: existing.iv, ciphertext: existing.encrypted_data, authTag: existing.auth_tag },
    encKey
  )

  const updatedData = {
    title: data.title ?? existingData.title,
    username: data.username ?? existingData.username,
    password: data.password ?? existingData.password,
    url: data.url ?? existingData.url,
    notes: data.notes ?? existingData.notes,
    totp_secret: data.totp_secret ?? existingData.totp_secret,
    card_number: data.card_number ?? existingData.card_number,
    card_holder: data.card_holder ?? existingData.card_holder,
    card_expiry: data.card_expiry ?? existingData.card_expiry,
    card_cvv: data.card_cvv ?? existingData.card_cvv,
    identity_first_name: data.identity_first_name ?? existingData.identity_first_name,
    identity_last_name: data.identity_last_name ?? existingData.identity_last_name,
    identity_phone: data.identity_phone ?? existingData.identity_phone,
    identity_email: data.identity_email ?? existingData.identity_email,
    identity_address: data.identity_address ?? existingData.identity_address,
    identity_ssn: data.identity_ssn ?? existingData.identity_ssn,
    identity_passport: data.identity_passport ?? existingData.identity_passport,
    identity_birthdate: data.identity_birthdate ?? existingData.identity_birthdate,
  }

  // History before update
  webRun(
    `INSERT INTO entry_history (entry_id, encrypted_snapshot, iv, auth_tag, change_type)
     VALUES (?, ?, ?, ?, 'update')`,
    [id, existing.encrypted_data, existing.iv, existing.auth_tag]
  )

  const encrypted = await encryptJSON(updatedData, encKey)
  const displayTitle = data.title ?? existing.display_title

  webRun(
    `UPDATE encrypted_entries SET encrypted_data = ?, iv = ?, auth_tag = ?, display_title = ?, updated_at = datetime('now') WHERE id = ?`,
    [encrypted.ciphertext, encrypted.iv, encrypted.authTag, displayTitle, id]
  )

  await saveWebDatabase()
}

async function deleteEntryById(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return
  webRun(`UPDATE encrypted_entries SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id])
  await saveWebDatabase()
}

async function restoreEntry(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return
  webRun(`UPDATE encrypted_entries SET deleted_at = NULL WHERE id = ?`, [id])
  await saveWebDatabase()
}

async function permanentDeleteEntry(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return
  webRun('DELETE FROM encrypted_entries WHERE id = ?', [id])
  await saveWebDatabase()
}

async function getDeletedEntries(): Promise<EncryptedEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []
  return webQueryAll<EncryptedEntry>(
    'SELECT * FROM encrypted_entries WHERE deleted_at IS NOT NULL AND vault_id = ? ORDER BY deleted_at DESC',
    [activeVaultId]
  )
}

async function cleanupOldDeletedEntries(): Promise<number> {
  const encKey = getEncryptionKey()
  if (!encKey) return 0
  const countResult = webQueryAll<{ count: number }>(
    `SELECT COUNT(*) as count FROM encrypted_entries WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`
  )
  const count = countResult[0]?.count ?? 0
  if (count > 0) {
    webRun(`DELETE FROM encrypted_entries WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`)
    await saveWebDatabase()
  }
  return count
}

async function searchEntries(query: string, filters?: EntryFilters): Promise<EncryptedEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []

  const escapedQuery = query.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')
  let sql = `SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ? AND (display_title LIKE ? ESCAPE '\\' OR entry_type LIKE ? ESCAPE '\\')`
  const params: any[] = [activeVaultId, `%${escapedQuery}%`, `%${escapedQuery}%`]

  if (filters) {
    if (filters.category_id !== undefined && filters.category_id !== null) {
      sql += ' AND category_id = ?'
      params.push(filters.category_id)
    }
    if (filters.is_favorite !== undefined) {
      sql += ' AND is_favorite = ?'
      params.push(filters.is_favorite ? 1 : 0)
    }
    if (filters.entry_type) {
      sql += ' AND entry_type = ?'
      params.push(filters.entry_type)
    }
  }

  sql += ' ORDER BY updated_at DESC'
  return webQueryAll<EncryptedEntry>(sql, params)
}

async function toggleFavoriteEntry(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return
  webRun(
    `UPDATE encrypted_entries SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?`,
    [id]
  )
  await saveWebDatabase()
}

// ─── Alarm Mode — bypass encryption key check ───────────

async function forceListEntries(): Promise<EncryptedEntry[]> {
  return webQueryAll<EncryptedEntry>(
    'SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ?',
    [activeVaultId]
  )
}

async function forcePermanentDeleteEntry(id: number): Promise<void> {
  webRun('DELETE FROM encrypted_entries WHERE id = ?', [id])
  await saveWebDatabase()
}

async function getPanicBackupEntries(): Promise<Array<EncryptedEntry & { decrypted?: Record<string, string> }>> {
  const entries = await webQueryAll<EncryptedEntry>(
    'SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ?',
    [activeVaultId]
  )

  const panicEncKey = getPanicEncryptionKey()
  if (!panicEncKey) return entries

  return Promise.all(entries.map(async (entry) => {
    let decrypted: Record<string, string> | undefined
    try {
      decrypted = await decryptJSON<Record<string, string>>(
        { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
        panicEncKey
      )
    } catch {}
    return { ...entry, decrypted }
  }))
}

function completePanic(): void {
  clearPanicKey()
}

// Save backup as downloadable file (web version)
async function sendBackupWeb(backupData: string): Promise<{ success: boolean; error?: string; filePath?: string; sent?: boolean }> {
  try {
    const blob = new Blob([backupData], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `panic-backup-${timestamp}.enc`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return { success: true, sent: false }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function getEntryHistoryList(id: number): Promise<EntryHistoryItem[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []
  return webQueryAll<EntryHistoryItem>(
    `SELECT id, entry_id, change_type, changed_at FROM entry_history WHERE entry_id = ? ORDER BY changed_at DESC`,
    [id]
  )
}

async function getDecryptedHistory(id: number): Promise<Array<EntryHistoryItem & { decrypted: Record<string, string> | null }>> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const rows = webQueryAll<any>(
    `SELECT id, entry_id, encrypted_snapshot, iv, auth_tag, change_type, changed_at FROM entry_history WHERE entry_id = ? ORDER BY changed_at DESC`,
    [id]
  )

  return Promise.all(rows.map(async (row) => {
    let decrypted: Record<string, string> | null = null
    try {
      decrypted = await decryptJSON<Record<string, string>>(
        { iv: row.iv, ciphertext: row.encrypted_snapshot, authTag: row.auth_tag },
        encKey
      )
    } catch {}
    return {
      id: row.id,
      entry_id: row.entry_id,
      change_type: row.change_type as 'create' | 'update' | 'delete',
      changed_at: row.changed_at,
      decrypted,
    }
  }))
}

async function getEntryTOTP(id: number): Promise<string | null> {
  const encKey = getEncryptionKey()
  if (!encKey) return null

  const entry = webQueryOne<EncryptedEntry>('SELECT * FROM encrypted_entries WHERE id = ?', [id])
  if (!entry) return null

  const decrypted = await decryptJSON<Record<string, string>>(
    { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
    encKey
  )
  if (!decrypted.totp_secret) return null

  try {
    return await generateTOTPToken(decrypted.totp_secret)
  } catch {
    return null
  }
}

// ─── Category Operations ────────────────────────────────

async function getCategories(): Promise<Category[]> {
  await getWebDatabase()
  return webQueryAll<Category>('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
}

async function createCategory(data: CreateCategoryPayload): Promise<Category> {
  await getWebDatabase()
  const maxOrderResult = webQueryAll<{ max_order: number }>('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM categories')
  const maxOrder = maxOrderResult[0]?.max_order ?? 0

  webRun(
    'INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)',
    [data.name, data.icon || 'folder', data.color || '#6366f1', maxOrder + 1]
  )

  const lastIdResult = webQueryAll<any>('SELECT last_insert_rowid() as id')
  await saveWebDatabase()
  return webQueryOne<Category>('SELECT * FROM categories WHERE id = ?', [lastIdResult[0].id])!
}

async function updateCategory(id: number, data: Partial<CreateCategoryPayload>): Promise<void> {
  await getWebDatabase()
  const sets: string[] = []
  const values: any[] = []

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name) }
  if (data.icon !== undefined) { sets.push('icon = ?'); values.push(data.icon) }
  if (data.color !== undefined) { sets.push('color = ?'); values.push(data.color) }

  if (sets.length === 0) return
  values.push(id)

  webRun(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, values)
  await saveWebDatabase()
}

async function deleteCategory(id: number): Promise<void> {
  await getWebDatabase()
  webRun('DELETE FROM categories WHERE id = ?', [id])
  await saveWebDatabase()
}

async function reorderCategories(ids: number[]): Promise<void> {
  await getWebDatabase()
  ids.forEach((id, index) => {
    webRun('UPDATE categories SET sort_order = ? WHERE id = ?', [index, id])
  })
  await saveWebDatabase()
}

// ─── Password Operations ────────────────────────────────

function unbiasedRandom(max: number): number {
  const limit = 256 - (256 % max)
  let byte: number
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0]
  } while (byte >= limit)
  return byte % max
}

function generatePasswordLocal(options: PasswordOptions): string {
  const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
  const NUMBERS = '0123456789'
  const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'

  let charset = ''
  if (options.uppercase) charset += UPPERCASE
  if (options.lowercase) charset += LOWERCASE
  if (options.numbers) charset += NUMBERS
  if (options.symbols) charset += SYMBOLS
  if (!charset) charset = LOWERCASE

  const length = Math.max(8, Math.min(128, options.length))
  let password = ''

  for (let j = 0; j < length; j++) {
    password += charset[unbiasedRandom(charset.length)]
  }

  // Ensure at least one character from each selected type
  const ensureChars: string[] = []
  if (options.uppercase) ensureChars.push(UPPERCASE[unbiasedRandom(UPPERCASE.length)])
  if (options.lowercase) ensureChars.push(LOWERCASE[unbiasedRandom(LOWERCASE.length)])
  if (options.numbers) ensureChars.push(NUMBERS[unbiasedRandom(NUMBERS.length)])
  if (options.symbols) ensureChars.push(SYMBOLS[unbiasedRandom(SYMBOLS.length)])

  const pwArray = password.split('')
  for (let i = 0; i < ensureChars.length; i++) {
    pwArray[unbiasedRandom(pwArray.length)] = ensureChars[i]
  }

  return pwArray.join('')
}

function generateUsernameLocal(): string {
  const adjectives = [
    'swift', 'dark', 'bright', 'cool', 'fast', 'blue', 'red', 'green',
    'golden', 'silver', 'iron', 'crystal', 'shadow', 'thunder', 'storm',
    'fire', 'ice', 'wind', 'stone', 'wolf', 'eagle', 'fox', 'bear',
    'cosmic', 'stellar', 'lunar', 'solar', 'neon', 'pixel', 'cyber',
    'ninja', 'pirate', 'ghost', 'phantom', 'dragon', 'tiger', 'hawk',
  ]
  const nouns = [
    'rider', 'hunter', 'walker', 'seeker', 'keeper', 'maker', 'shaper',
    'coder', 'hacker', 'builder', 'finder', 'weaver', 'coder', 'minder',
    'knight', 'mage', 'rogue', 'sage', 'chef', 'pilot', 'ranger',
    'shadow', 'phoenix', 'falcon', 'viper', 'cobra', 'panther',
    'storm', 'blaze', 'frost', 'spark', 'wave', 'bolt', 'dash',
  ]
  const adj = adjectives[unbiasedRandom(adjectives.length)]
  const noun = nouns[unbiasedRandom(nouns.length)]
  const num = unbiasedRandom(100)
  return `${adj}${noun}${num}`
}

const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'awesome', 'awful', 'awkward', 'axis', 'baby',
  'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball', 'bamboo',
  'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base', 'basic',
  'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become', 'beef',
  'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench',
  'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid',
  'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black', 'blade',
  'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood', 'blossom',
  'blow', 'blue', 'blur', 'blush', 'board', 'boat', 'body', 'boil',
  'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow',
  'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand',
  'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief', 'bright',
  'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother', 'brown',
  'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb', 'bulk',
  'bullet', 'bundle', 'bunny', 'burden', 'burger', 'burst', 'bus', 'business',
  'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus',
  'cage', 'cake', 'call', 'calm', 'camera', 'camp', 'can', 'canal',
  'cancel', 'candy', 'cannon', 'canoe', 'canvas', 'canyon', 'capable', 'capital',
  'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry', 'cart',
  'case', 'cash', 'casino', 'castle', 'casual', 'cat', 'catalog', 'catch',
  'category', 'cattle', 'caught', 'cause', 'caution', 'cave', 'ceiling', 'celery',
  'cement', 'census', 'century', 'cereal', 'certain', 'chair', 'chalk', 'champion',
  'change', 'chaos', 'chapter', 'charge', 'chase', 'cheap', 'check', 'cheese',
  'chef', 'cherry', 'chest', 'chicken', 'chief', 'child', 'chimney', 'choice',
  'choose', 'chronic', 'chuckle', 'chunk', 'churn', 'citizen', 'city', 'civil',
  'claim', 'clap', 'clarify', 'claw', 'clay', 'clean', 'clerk', 'clever',
  'cliff', 'climb', 'clinic', 'clip', 'clock', 'clog', 'close', 'cloth',
  'cloud', 'clown', 'club', 'clump', 'cluster', 'clutch', 'coach', 'coast',
  'coconut', 'code', 'coffee', 'coil', 'coin', 'collect', 'color', 'column',
  'combine', 'come', 'comfort', 'comic', 'common', 'company', 'concert', 'conduct',
  'confirm', 'congress', 'connect', 'consider', 'control', 'convince', 'cook', 'cool',
  'copper', 'copy', 'coral', 'core', 'corn', 'correct', 'cost', 'cotton',
  'couch', 'country', 'couple', 'course', 'cousin', 'cover', 'coyote', 'crack',
  'cradle', 'craft', 'cram', 'crane', 'crash', 'crater', 'crawl', 'crazy',
  'cream', 'credit', 'creek', 'crew', 'cricket', 'crime', 'crisp', 'critic',
  'crop', 'cross', 'crouch', 'crowd', 'crucial', 'cruel', 'cruise', 'crumble',
  'crush', 'cry', 'crystal', 'cube', 'culture', 'cup', 'cupboard', 'curious',
  'current', 'curtain', 'curve', 'cushion', 'custom', 'cute', 'cycle', 'dad',
  'damage', 'damp', 'dance', 'danger', 'daring', 'dash', 'daughter', 'dawn',
  'day', 'deal', 'debate', 'debris', 'decade', 'december', 'decide', 'decline',
  'decorate', 'decrease', 'deer', 'defense', 'define', 'defy', 'degree', 'delay',
  'deliver', 'demand', 'demise', 'denial', 'dentist', 'deny', 'depart', 'depend',
  'deposit', 'depth', 'deputy', 'derive', 'describe', 'desert', 'design', 'desk',
  'despair', 'destroy', 'detail', 'detect', 'develop', 'device', 'devote', 'diagram',
  'dial', 'diamond', 'diary', 'dice', 'diesel', 'diet', 'differ', 'digital',
  'dignity', 'dilemma', 'dinner', 'dinosaur', 'direct', 'dirt', 'disagree', 'discover',
  'disease', 'dish', 'dismiss', 'disorder', 'display', 'distance', 'divert', 'divide',
  'divorce', 'dizzy', 'doctor', 'document', 'dog', 'doll', 'dolphin', 'domain',
  'donate', 'donkey', 'donor', 'door', 'dose', 'double', 'dove', 'draft',
  'dragon', 'drama', 'drastic', 'draw', 'dream', 'dress', 'drift', 'drill',
  'drink', 'drip', 'drive', 'drop', 'drum', 'dry', 'duck', 'dumb',
  'dune', 'during', 'dust', 'dutch', 'duty', 'dwarf', 'dynamic', 'eager',
  'eagle', 'early', 'earn', 'earth', 'easily', 'east', 'easy', 'echo',
  'ecology', 'economy', 'edge', 'edit', 'educate', 'effort', 'egg', 'eight',
  'either', 'elbow', 'elder', 'electric', 'elegant', 'element', 'elephant', 'elevator',
  'elite', 'else', 'embark', 'embody', 'embrace', 'emerge', 'emotion', 'employ',
  'empower', 'empty', 'enable', 'encourage', 'end', 'endless', 'endorse', 'enemy',
  'energy', 'enforce', 'engage', 'engine', 'enhance', 'enjoy', 'enlist', 'enough',
  'enrich', 'enroll', 'ensure', 'enter', 'entire', 'entry', 'envelope', 'episode',
  'equal', 'equip', 'era', 'erase', 'erode', 'erosion', 'error', 'erupt',
  'escape', 'essay', 'essence', 'estate', 'eternal', 'ethics', 'evidence', 'evil',
  'evoke', 'evolve', 'exact', 'example', 'excess', 'exchange', 'excite', 'exclude',
  'excuse', 'execute', 'exercise', 'exhaust', 'exhibit', 'exile', 'exist', 'exit',
  'exotic', 'expand', 'expect', 'expire', 'explain', 'expose', 'express', 'extend',
  'extra', 'eye', 'eyebrow', 'fabric', 'face', 'faculty', 'fade', 'faint',
  'faith', 'fall', 'false', 'fame', 'family', 'famous', 'fan', 'fancy',
  'fantasy', 'farm', 'fashion', 'fat', 'fatal', 'father', 'fatigue', 'fault',
  'favorite', 'feature', 'february', 'federal', 'fee', 'feed', 'feel', 'female',
  'fence', 'festival', 'fetch', 'fever', 'few', 'fiber', 'fiction', 'field',
  'figure', 'file', 'film', 'filter', 'final', 'find', 'fine', 'finger',
  'finish', 'fire', 'firm', 'fiscal', 'fish', 'fit', 'fitness', 'fix',
  'flag', 'flame', 'flash', 'flat', 'flavor', 'flee', 'flight', 'flip',
  'float', 'flock', 'floor', 'flower', 'fluid', 'flush', 'fly', 'foam',
  'focus', 'fog', 'foil', 'fold', 'follow', 'food', 'foot', 'force',
  'forest', 'forget', 'fork', 'fortune', 'forum', 'forward', 'fossil', 'foster',
  'found', 'fox', 'fragile', 'frame', 'frequent', 'fresh', 'friend', 'fringe',
  'frog', 'front', 'frost', 'frown', 'frozen', 'fruit', 'fuel', 'fun',
  'funny', 'furnace', 'fury', 'future', 'gadget', 'gain', 'galaxy', 'gallery',
  'game', 'gap', 'garage', 'garbage', 'garden', 'garlic', 'garment', 'gas',
  'gasp', 'gate', 'gather', 'gauge', 'gaze', 'general', 'genius', 'genre',
  'gentle', 'genuine', 'gesture', 'ghost', 'giant', 'gift', 'giggle', 'ginger',
  'giraffe', 'girl', 'give', 'glad', 'glance', 'glare', 'glass', 'glide',
  'glimpse', 'globe', 'gloom', 'glory', 'glove', 'glow', 'glue', 'goat',
  'goddess', 'gold', 'good', 'goose', 'gorilla', 'gospel', 'gossip', 'govern',
  'gown', 'grab', 'grace', 'grain', 'grant', 'grape', 'grass', 'gravity',
  'great', 'green', 'grid', 'grief', 'grit', 'grocery', 'group', 'grow',
  'grunt', 'guard', 'guess', 'guide', 'guilt', 'guitar', 'gun', 'gym',
  'habit', 'hair', 'half', 'hammer', 'hamster', 'hand', 'happy', 'harbor',
  'hard', 'harsh', 'harvest', 'hat', 'have', 'hawk', 'hazard', 'head',
  'health', 'heart', 'heavy', 'hedgehog', 'height', 'hello', 'helmet', 'help',
  'hen', 'hero', 'hip', 'hire', 'history', 'hobby', 'hockey', 'hold',
  'hole', 'holiday', 'hollow', 'home', 'honey', 'hood', 'hope', 'horn',
  'horror', 'horse', 'hospital', 'host', 'hotel', 'hour', 'hover', 'hub',
  'huge', 'human', 'humble', 'humor', 'hundred', 'hungry', 'hunt', 'hurdle',
  'hurry', 'hurt', 'husband', 'hybrid', 'ice', 'icon', 'idea', 'identify',
  'idle', 'ignore', 'ill', 'illegal', 'illness', 'image', 'imitate', 'immense',
  'immune', 'impact', 'impose', 'improve', 'impulse', 'inch', 'include', 'income',
  'increase', 'index', 'indicate', 'indoor', 'industry', 'infant', 'inflict', 'inform',
  'initial', 'inject', 'inmate', 'inner', 'innocent', 'input', 'inquiry', 'insane',
  'insect', 'inside', 'inspire', 'install', 'intact', 'interest', 'into', 'invest',
  'invite', 'involve', 'iron', 'island', 'isolate', 'issue', 'item', 'ivory',
  'jacket', 'jaguar', 'jar', 'jazz', 'jealous', 'jeans', 'jelly', 'jewel',
  'job', 'join', 'joke', 'journey', 'joy', 'judge', 'juice', 'jump',
  'jungle', 'junior', 'junk', 'just', 'kangaroo', 'keen', 'keep', 'ketchup',
  'key', 'kick', 'kid', 'kidney', 'kind', 'kingdom', 'kiss', 'kit',
  'kitchen', 'kite', 'kitten', 'kiwi', 'knee', 'knife', 'knock', 'know',
  'lab', 'label', 'labor', 'ladder', 'lady', 'lake', 'lamp', 'language',
  'laptop', 'large', 'later', 'latin', 'laugh', 'laundry', 'lava', 'law',
  'lawn', 'lawsuit', 'layer', 'lazy', 'leader', 'leaf', 'learn', 'leave',
  'lecture', 'left', 'leg', 'legal', 'legend', 'leisure', 'lemon', 'lend',
  'length', 'lens', 'leopard', 'lesson', 'letter', 'level', 'liberty', 'library',
  'license', 'life', 'lift', 'light', 'like', 'limb', 'limit', 'link',
  'lion', 'liquid', 'list', 'little', 'live', 'lizard', 'load', 'loan',
  'lobster', 'local', 'lock', 'logic', 'lonely', 'long', 'loop', 'lottery',
  'loud', 'lounge', 'love', 'loyal', 'lucky', 'luggage', 'lumber', 'lunar',
  'lunch', 'luxury', 'lyrics', 'machine', 'mad', 'magic', 'magnet', 'maid',
  'mail', 'main', 'major', 'make', 'mammal', 'man', 'manage', 'mandate',
  'mango', 'mansion', 'manual', 'maple', 'marble', 'march', 'margin', 'marine',
  'market', 'marriage', 'mask', 'mass', 'master', 'match', 'material', 'math',
  'matrix', 'matter', 'maximum', 'maze', 'meadow', 'mean', 'measure', 'meat',
  'mechanic', 'medal', 'media', 'melody', 'melt', 'member', 'memory', 'mention',
  'menu', 'mercy', 'merge', 'merit', 'merry', 'mesh', 'message', 'metal',
  'method', 'middle', 'midnight', 'milk', 'million', 'mimic', 'mind', 'minimum',
  'minor', 'minute', 'miracle', 'mirror', 'misery', 'miss', 'mistake', 'mix',
  'mixed', 'mixture', 'mobile', 'model', 'modify', 'mom', 'moment', 'monitor',
  'monkey', 'monster', 'month', 'moon', 'moral', 'more', 'morning', 'mosquito',
  'mother', 'motion', 'motor', 'mountain', 'mouse', 'move', 'movie', 'much',
  'muffin', 'mule', 'multiply', 'muscle', 'museum', 'mushroom', 'music', 'must',
  'mutual', 'myself', 'mystery', 'myth', 'naive', 'name', 'napkin', 'narrow',
  'nasty', 'nation', 'nature', 'near', 'neck', 'need', 'negative', 'neglect',
  'neither', 'nephew', 'nerve', 'nest', 'net', 'network', 'neutral', 'never',
  'news', 'next', 'nice', 'night', 'noble', 'noise', 'nominee', 'noodle',
  'normal', 'north', 'nose', 'notable', 'nothing', 'notice', 'novel', 'now',
  'nuclear', 'number', 'nurse', 'nut', 'oak', 'obey', 'object', 'oblige',
  'obscure', 'observe', 'obtain', 'obvious', 'occur', 'ocean', 'october', 'odor',
  'off', 'offer', 'office', 'often', 'oil', 'okay', 'old', 'olive',
  'olympic', 'omit', 'once', 'one', 'onion', 'online', 'only', 'open',
  'opera', 'opinion', 'oppose', 'option', 'orange', 'orbit', 'orchard', 'order',
  'ordinary', 'organ', 'orient', 'original', 'orphan', 'ostrich', 'other', 'outdoor',
  'outer', 'output', 'outside', 'oval', 'oven', 'over', 'own', 'owner',
  'oxygen', 'oyster', 'ozone', 'pact', 'paddle', 'page', 'pair', 'palace',
  'palm', 'panda', 'panel', 'panic', 'panther', 'paper', 'parade', 'parent',
  'park', 'parrot', 'party', 'pass', 'patch', 'path', 'patient', 'patrol',
  'pattern', 'pause', 'pave', 'payment', 'peace', 'peanut', 'pear', 'peasant',
  'pelican', 'pen', 'penalty', 'pencil', 'people', 'pepper', 'perfect', 'permit',
  'person', 'pet', 'phone', 'photo', 'phrase', 'physical', 'piano', 'picnic',
  'picture', 'piece', 'pig', 'pigeon', 'pill', 'pilot', 'pink', 'pioneer',
  'pipe', 'pistol', 'pitch', 'pizza', 'place', 'planet', 'plastic', 'plate',
  'play', 'please', 'pledge', 'pluck', 'plug', 'plunge', 'poem', 'poet',
  'point', 'polar', 'pole', 'police', 'pond', 'pony', 'pool', 'popular',
  'portion', 'position', 'possible', 'post', 'potato', 'pottery', 'poverty', 'powder',
  'power', 'practice', 'praise', 'predict', 'prefer', 'prepare', 'present', 'pretty',
  'prevent', 'price', 'pride', 'primary', 'print', 'priority', 'prison', 'private',
  'prize', 'problem', 'process', 'produce', 'profit', 'program', 'project', 'promote',
  'proof', 'property', 'prosper', 'protect', 'proud', 'provide', 'public', 'pudding',
  'pull', 'pulp', 'pulse', 'pumpkin', 'punch', 'pupil', 'puppy', 'purchase',
  'purity', 'purpose', 'purse', 'push', 'put', 'puzzle', 'pyramid', 'quality',
  'quantum', 'quarter', 'question', 'quick', 'quit', 'quiz', 'quote', 'rabbit',
  'raccoon', 'race', 'rack', 'radar', 'radio', 'rage', 'rail', 'rain',
  'raise', 'rally', 'ramp', 'ranch', 'random', 'range', 'rapid', 'rare',
  'rate', 'rather', 'raven', 'raw', 'razor', 'ready', 'real', 'reason',
  'rebel', 'rebuild', 'recall', 'receive', 'recipe', 'record', 'recycle', 'reduce',
  'reflect', 'reform', 'region', 'regret', 'regular', 'reject', 'relax', 'release',
  'relief', 'rely', 'remain', 'remember', 'remind', 'remove', 'render', 'renew',
  'rent', 'reopen', 'repair', 'repeat', 'replace', 'report', 'require', 'rescue',
  'resemble', 'resist', 'resource', 'response', 'result', 'retire', 'retreat', 'return',
  'reunion', 'reveal', 'review', 'reward', 'rhythm', 'rib', 'ribbon', 'rice',
  'rich', 'ride', 'ridge', 'rifle', 'right', 'rigid', 'ring', 'riot',
  'ripple', 'risk', 'ritual', 'rival', 'river', 'road', 'roast', 'robot',
  'robust', 'rocket', 'romance', 'roof', 'rookie', 'room', 'rose', 'rotate',
  'rough', 'round', 'route', 'royal', 'rubber', 'rude', 'rug', 'rule',
  'run', 'runway', 'rural', 'sad', 'saddle', 'sadness', 'safe', 'sail',
  'salad', 'salmon', 'salon', 'salt', 'salute', 'same', 'sample', 'sand',
  'satisfy', 'satoshi', 'sauce', 'sausage', 'save', 'say', 'scale', 'scan',
  'scare', 'scatter', 'scene', 'scheme', 'school', 'science', 'scissors', 'scorpion',
  'scout', 'scrap', 'screen', 'script', 'scrub', 'sea', 'search', 'season',
  'seat', 'second', 'secret', 'section', 'security', 'seed', 'seek', 'segment',
  'select', 'sell', 'seminar', 'senior', 'sense', 'sentence', 'series', 'service',
  'session', 'settle', 'setup', 'seven', 'shadow', 'shaft', 'shallow', 'share',
  'shed', 'shell', 'sheriff', 'shield', 'shift', 'shine', 'ship', 'shiver',
  'shock', 'shoe', 'shoot', 'shop', 'short', 'shoulder', 'shove', 'shrimp',
  'shrug', 'shuffle', 'shy', 'sibling', 'sick', 'side', 'siege', 'sight',
  'sign', 'silent', 'silk', 'silly', 'silver', 'similar', 'simple', 'since',
  'sing', 'siren', 'sister', 'situate', 'six', 'size', 'skate', 'sketch',
  'ski', 'skill', 'skin', 'skirt', 'skull', 'slab', 'slam', 'sleep',
  'slender', 'slice', 'slide', 'slight', 'slim', 'slogan', 'slot', 'slow',
  'slush', 'small', 'smart', 'smile', 'smoke', 'smooth', 'snack', 'snake',
  'snap', 'sniff', 'snow', 'soap', 'soccer', 'social', 'sock', 'soda',
  'soft', 'solar', 'soldier', 'solid', 'solution', 'solve', 'someone', 'song',
  'soon', 'sorry', 'sort', 'soul', 'sound', 'soup', 'source', 'south',
  'space', 'spare', 'spatial', 'spawn', 'speak', 'special', 'speed', 'spell',
  'spend', 'sphere', 'spice', 'spider', 'spike', 'spin', 'spirit', 'split',
  'sponsor', 'spoon', 'sport', 'spot', 'spray', 'spread', 'spring', 'spy',
  'square', 'squeeze', 'squirrel', 'stable', 'stadium', 'staff', 'stage', 'stairs',
  'stamp', 'stand', 'start', 'state', 'stay', 'steak', 'steel', 'stem',
  'step', 'stereo', 'stick', 'still', 'sting', 'stock', 'stomach', 'stone',
  'stool', 'story', 'stove', 'strategy', 'street', 'strike', 'strong', 'struggle',
  'student', 'stuff', 'stumble', 'style', 'subject', 'submit', 'subway', 'success',
  'such', 'sudden', 'suffer', 'sugar', 'suggest', 'suit', 'summer', 'sun',
  'sunny', 'sunset', 'super', 'supply', 'supreme', 'sure', 'surface', 'surge',
  'surprise', 'surround', 'survey', 'suspect', 'sustain', 'swallow', 'swamp', 'swap',
  'swarm', 'swear', 'sweet', 'swim', 'swing', 'switch', 'sword', 'symbol',
  'symptom', 'syrup', 'system', 'table', 'tackle', 'tag', 'tail', 'talent',
  'talk', 'tank', 'tape', 'target', 'task', 'taste', 'tattoo', 'taxi',
  'teach', 'team', 'tell', 'ten', 'tenant', 'tennis', 'tent', 'term',
  'test', 'text', 'thank', 'that', 'theme', 'then', 'theory', 'there',
  'they', 'thing', 'this', 'thought', 'three', 'thrive', 'throw', 'thumb',
  'thunder', 'ticket', 'tide', 'tiger', 'tilt', 'timber', 'time', 'tiny',
  'tip', 'tired', 'tissue', 'title', 'toast', 'tobacco', 'today', 'toddler',
  'toe', 'together', 'toilet', 'token', 'tomato', 'tomorrow', 'tone', 'tongue',
  'tonight', 'tool', 'tooth', 'top', 'topic', 'topple', 'torch', 'tornado',
  'tortoise', 'toss', 'total', 'tourist', 'toward', 'tower', 'town', 'toy',
  'track', 'trade', 'traffic', 'tragic', 'train', 'transfer', 'trap', 'trash',
  'travel', 'tray', 'treat', 'tree', 'trend', 'trial', 'tribe', 'trick',
  'trigger', 'trim', 'trip', 'trophy', 'trouble', 'truck', 'true', 'truly',
  'trumpet', 'trust', 'truth', 'try', 'tube', 'tuna', 'tunnel', 'turkey',
  'turn', 'turtle', 'twelve', 'twenty', 'twice', 'twin', 'twist', 'two',
  'type', 'typical', 'ugly', 'umbrella', 'unable', 'unaware', 'uncle', 'uncover',
  'under', 'undo', 'unfair', 'unfold', 'unhappy', 'uniform', 'union', 'unique',
  'unit', 'universe', 'unknown', 'unlock', 'until', 'unusual', 'unveil', 'update',
  'upgrade', 'uphold', 'upon', 'upper', 'upset', 'urban', 'usage', 'use',
  'used', 'useful', 'useless', 'usual', 'utility', 'vacant', 'vacuum', 'vague',
  'valid', 'valley', 'valve', 'van', 'vanish', 'vapor', 'various', 'vast',
  'vault', 'vehicle', 'velvet', 'vendor', 'venture', 'venue', 'verb', 'version',
  'very', 'vessel', 'veteran', 'viable', 'vibrant', 'vicious', 'victory', 'video',
  'view', 'village', 'vintage', 'violin', 'virtual', 'virus', 'visa', 'visit',
  'visual', 'vital', 'vivid', 'vocal', 'voice', 'void', 'volcano', 'volume',
  'vote', 'voyage', 'wage', 'wagon', 'wait', 'walk', 'wall', 'walnut',
  'want', 'warfare', 'warm', 'warrior', 'wash', 'wasp', 'waste', 'water',
  'wave', 'way', 'wealth', 'weapon', 'wear', 'weasel', 'weather', 'web',
  'wedding', 'weekend', 'weird', 'welcome', 'well', 'west', 'wet', 'whale',
  'what', 'wheat', 'wheel', 'when', 'where', 'whip', 'whisper', 'wide',
  'width', 'wife', 'wild', 'will', 'win', 'window', 'wine', 'wing',
  'wink', 'winner', 'winter', 'wire', 'wisdom', 'wise', 'wish', 'witness',
  'wolf', 'woman', 'wonder', 'wood', 'wool', 'word', 'work', 'world',
  'worry', 'worth', 'wrap', 'wreck', 'wrestle', 'wrist', 'write', 'wrong',
  'yard', 'year', 'yellow', 'you', 'young', 'youth', 'zebra', 'zero',
  'zone', 'zoo',
]

function generatePassphraseLocal(wordCount: number = 4): string {
  const count = Math.max(3, Math.min(8, wordCount))
  const words: string[] = []
  for (let i = 0; i < count; i++) {
    words.push(WORDLIST[unbiasedRandom(WORDLIST.length)])
  }
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')
}

// ─── Breach Check ──────────────────────────────────────

async function checkBreachLocal(password: string): Promise<{ breached: boolean; count: number }> {
  // SHA-1 hash using Web Crypto API
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = new Uint8Array(hashBuffer)
  const sha1 = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`)
    if (!response.ok) return { breached: false, count: 0 }

    const text = await response.text()
    const lines = text.split('\n')

    for (const line of lines) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix.trim() === suffix) {
        return { breached: true, count: parseInt(count.trim(), 10) }
      }
    }

    return { breached: false, count: 0 }
  } catch {
    return { breached: false, count: 0 }
  }
}

// ─── Health Analysis ────────────────────────────────────

async function analyzePasswordHealthLocal(): Promise<PasswordHealth> {
  const encKey = getEncryptionKey()
  if (!encKey) return { total: 0, weak: 0, reused: 0, old: 0, exposed: 0, score: 100, details: [] }

  const entries = webQueryAll<EncryptedEntry>(
    'SELECT * FROM encrypted_entries WHERE deleted_at IS NULL AND vault_id = ?',
    [activeVaultId]
  )

  // Common weak passwords list (top 100)
  const COMMON_PASSWORDS = new Set([
    'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
    'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
    'ashley', 'bailey', 'passw0rd', 'shadow', '123123', '654321', 'superman',
    'qazwsx', 'michael', 'football', 'password1', 'password123', 'admin',
    'welcome', 'login', 'princess', 'starwars', 'hello', 'charlie', 'donald',
    'access', 'hottie', 'loveme', 'zaq1zaq1', 'qwerty123', '1q2w3e4r',
    '1234qwer', 'password!', 'p@ssword', 'p@ssw0rd', 'passpass',
  ])

  const details: PasswordHealthItem[] = []
  const passwordMap = new Map<string, number[]>()
  let weak = 0
  let reused = 0
  let old = 0
  let exposed = 0

  for (const entry of entries) {
    try {
      const decrypted = await decryptJSON<{ password?: string; title?: string }>(
        { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
        encKey
      )

      if (!decrypted.password) continue

      const pwd = decrypted.password
      const title = decrypted.title || entry.display_title
      const issues: string[] = []

      // Length check
      if (pwd.length < 8) {
        issues.push('too_short')
      }

      // Complexity checks
      const hasUpper = /[A-Z]/.test(pwd)
      const hasLower = /[a-z]/.test(pwd)
      const hasNumber = /[0-9]/.test(pwd)
      const hasSpecial = /[^a-zA-Z0-9]/.test(pwd)

      if (!hasUpper) issues.push('missing_uppercase')
      if (!hasLower) issues.push('missing_lowercase')
      if (!hasNumber) issues.push('missing_numbers')
      if (!hasSpecial) issues.push('missing_special')

      // All same case
      if (hasUpper && !hasLower) issues.push('all_uppercase')
      if (hasLower && !hasUpper) issues.push('all_lowercase')

      // Common password check
      const pwdLower = pwd.toLowerCase()
      if (COMMON_PASSWORDS.has(pwdLower)) {
        issues.push('too_common')
      }

      // Sequential characters (abc, 123, cba, 321)
      if (/(.)\1{2,}/.test(pwd)) {
        issues.push('repeated')
      }
      if (/abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(pwd)) {
        issues.push('sequential')
      }
      if (/012|123|234|345|456|567|678|789|890/i.test(pwd)) {
        issues.push('sequential')
      }

      // Keyboard patterns
      if (/qwert|asdf|zxcv|qazws|wasd|qwerty|asdfgh|zxcvbn/i.test(pwdLower)) {
        issues.push('keyboard_pattern')
      }

      // Year pattern
      if (/19[5-9]\d|20[0-2]\d/.test(pwd)) {
        issues.push('contains_year')
      }

      if (issues.length > 0) weak++

      // Breach check
      try {
        const breachResult = await checkBreachLocal(pwd)
        if (breachResult.breached) {
          issues.push('breached')
          exposed++
        }
      } catch {}

      // Track for reuse detection
      const existing = passwordMap.get(pwd) || []
      existing.push(entry.id)
      passwordMap.set(pwd, existing)

      // Age check
      const updated = new Date(entry.updated_at)
      const daysSinceUpdate = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUpdate > 180) {
        issues.push('old_password')
        old++
      }

      if (issues.length > 0) {
        details.push({ entryId: entry.id, title, issues })
      }
    } catch {}
  }

  // Find reused passwords
  for (const [, ids] of passwordMap) {
    if (ids.length > 1) {
      reused += ids.length
      for (const id of ids) {
        const item = details.find(d => d.entryId === id)
        if (item) {
          if (!item.issues.includes('reused')) item.issues.push('reused')
        } else {
          const entry = entries.find(e => e.id === id)
          if (entry) {
            details.push({ entryId: id, title: entry.display_title, issues: ['reused'] })
          }
        }
      }
    }
  }

  const total = entries.length
  const score = total === 0 ? 100 : Math.max(0, Math.round(100 - (details.length / total) * 100))

  return { total, weak, reused, old, exposed, score, details }
}

// ─── Clipboard ──────────────────────────────────────────

let clipboardTimer: ReturnType<typeof setTimeout> | null = null

async function copyToClipboard(text: string, ttl: number = 30000): Promise<void> {
  if (clipboardTimer) {
    clearTimeout(clipboardTimer)
    clipboardTimer = null
  }

  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for Capacitor
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }

  if (ttl > 0) {
    clipboardTimer = setTimeout(() => {
      navigator.clipboard?.writeText('').catch(() => {})
      clipboardTimer = null
    }, ttl)
  }
}

async function clearClipboard(): Promise<void> {
  if (clipboardTimer) {
    clearTimeout(clipboardTimer)
    clipboardTimer = null
  }
  try {
    await navigator.clipboard?.writeText('')
  } catch {}
}

// ─── Helpers ────────────────────────────────────────────

function arrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToArray(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// ─── IPC Handler Map ────────────────────────────────────

type HandlerMap = {
  [K in keyof IPCChannels]?: (...args: any[]) => Promise<any> | any
}

export const webHandlers: HandlerMap = {
  // Vault
  'vault:status': getVaultStatus,
  'vault:setup': (_: any, masterPassword: string, alarmPassword?: string, displayName?: string) => setupVault(masterPassword, alarmPassword, displayName),
  'vault:create': (_: any, masterPassword: string, displayName: string) => setupVault(masterPassword, undefined, displayName),
  'vault:unlock': (_: any, masterPassword: string, totpCode?: string, vaultId?: number) => unlockVault(masterPassword, totpCode, vaultId),
  'vault:lock': () => { lockVault(); return Promise.resolve() },
  'vault:switch': async (_: any, vaultId: number) => {
    if (isUnlocked()) return { success: false, error: 'Lock the vault before switching' }
    const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [vaultId])
    if (!vault) return { success: false, error: 'Vault not found' }
    activeVaultId = vaultId
    return { success: true }
  },
  'vault:change-master-password': async (_: any, oldPassword: string, newPassword: string, totpCode?: string) => {
    if (!isUnlocked()) return { success: false, error: 'Vault is locked' }
    const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [activeVaultId])
    if (!vault) return { success: false, error: 'Vault not initialized' }

    // Verify TOTP if enabled
    if (vault.totp_enabled && vault.totp_secret) {
      if (!totpCode) return { success: false, error: 'TOTP code required' }
      const encKey = getEncryptionKey()!
      const parsed = parseTotpSecret(vault.totp_secret)
      if (!parsed) return { success: false, error: 'TOTP configuration is corrupted' }
      const decryptedSecret = await decryptJSON<string>(parsed, encKey)
      if (!await verifyTOTP(decryptedSecret, totpCode)) return { success: false, error: 'Invalid TOTP code' }
    }

    const oldSalt = hexToArray(vault.kdf_salt)
    const oldKey = await deriveKey(oldPassword, oldSalt)
    const { encryptionKey: oldEncKey } = splitDerivedKey(oldKey)
    const oldHash = await computeVerificationHash(oldEncKey)

    if (!timingSafeStringEqual(oldHash, vault.master_hash)) {
      return { success: false, error: 'Current password is incorrect' }
    }

    const newSalt = generateSalt()
    const newKey = await deriveKey(newPassword, newSalt)
    const { encryptionKey: newEncKey } = splitDerivedKey(newKey)
    const newHash = await computeVerificationHash(newEncKey)

    // Re-encrypt TOTP secret
    if (vault.totp_enabled && vault.totp_secret) {
      const parsed = parseTotpSecret(vault.totp_secret)
      if (parsed) {
        const decryptedSecret = await decryptJSON<string>(parsed, oldEncKey)
        const reEncrypted = await encrypt(decryptedSecret, newEncKey)
        const reEncryptedStr = `${reEncrypted.iv}:${reEncrypted.ciphertext}:${reEncrypted.authTag}`
        webRun(`UPDATE vault SET totp_secret = ?, updated_at = datetime('now') WHERE id = ?`, [reEncryptedStr, activeVaultId])
      }
    }

    try {
      webRun('BEGIN TRANSACTION')

      // Re-encrypt all entries
      const entries = webQueryAll<any>(
        'SELECT id, encrypted_data, iv, auth_tag FROM encrypted_entries WHERE vault_id = ?',
        [activeVaultId]
      )
      for (const row of entries) {
        const decrypted = await decryptJSON<Record<string, string>>(
          { iv: row.iv, ciphertext: row.encrypted_data, authTag: row.auth_tag },
          oldEncKey
        )
        const reEncrypted = await encryptJSON(decrypted, newEncKey)
        webRun(
          `UPDATE encrypted_entries SET encrypted_data = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE id = ?`,
          [reEncrypted.ciphertext, reEncrypted.iv, reEncrypted.authTag, row.id]
        )
      }

      // Re-encrypt history
      const historyRows = webQueryAll<any>(
        `SELECT h.id, h.encrypted_snapshot, h.iv, h.auth_tag
         FROM entry_history h
         JOIN encrypted_entries e ON h.entry_id = e.id
         WHERE e.vault_id = ?`,
        [activeVaultId]
      )
      for (const row of historyRows) {
        try {
          const decrypted = await decryptJSON<Record<string, string>>(
            { iv: row.iv, ciphertext: row.encrypted_snapshot, authTag: row.auth_tag },
            oldEncKey
          )
          const reEncrypted = await encryptJSON(decrypted, newEncKey)
          webRun(
            `UPDATE entry_history SET encrypted_snapshot = ?, iv = ?, auth_tag = ? WHERE id = ?`,
            [reEncrypted.ciphertext, reEncrypted.iv, reEncrypted.authTag, row.id]
          )
        } catch {}
      }

      webRun('COMMIT')
    } catch (err) {
      webRun('ROLLBACK')
      throw err
    }

    webRun(
      `UPDATE vault SET master_hash = ?, kdf_salt = ?, kdf_type = 'pbkdf2', updated_at = datetime('now') WHERE id = ?`,
      [newHash, arrayToHex(newSalt), activeVaultId]
    )

    await saveWebDatabase()
    derivedKey = newKey
    await startAutoLockTimer()
    return { success: true }
  },
  'vault:enable-totp': () => {
    if (!isUnlocked()) return { error: 'Vault is locked' }
    if (pendingTotpSecret) return { error: 'TOTP setup already in progress' }
    const secret = generateSecret()
    const qrCodeUrl = generateQRCodeUrl(secret, 'CipherVault')
    pendingTotpSecret = secret
    return { secret, qrCodeUrl }
  },
  'vault:verify-totp': async (_: any, code: string) => {
    const encKey = getEncryptionKey()
    if (!encKey) return false
    if (!pendingTotpSecret) return false
    if (!await verifyTOTP(pendingTotpSecret, code)) return false

    const encrypted = await encrypt(pendingTotpSecret, encKey)
    const encryptedStr = `${encrypted.iv}:${encrypted.ciphertext}:${encrypted.authTag}`
    webRun(`UPDATE vault SET totp_secret = ?, totp_enabled = 1, updated_at = datetime('now') WHERE id = ?`, [encryptedStr, activeVaultId])
    await saveWebDatabase()
    pendingTotpSecret = null
    return true
  },
  'vault:disable-totp': async (_: any, totpCode: string) => {
    const encKey = getEncryptionKey()
    if (!encKey) return false
    const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [activeVaultId])
    if (!vault || !vault.totp_secret) return false
    const parsed = parseTotpSecret(vault.totp_secret)
    if (!parsed) return false
    const decryptedSecret = await decryptJSON<string>(parsed, encKey)
    if (!await verifyTOTP(decryptedSecret, totpCode)) return false
    webRun(`UPDATE vault SET totp_secret = NULL, totp_enabled = 0, updated_at = datetime('now') WHERE id = ?`, [activeVaultId])
    await saveWebDatabase()
    return true
  },
  'vault:setup-alarm': async (_: any, alarmPassword: string, backupEmail?: string) => {
    const encKey = getEncryptionKey()
    if (!encKey) return { success: false, error: 'Vault is locked' }
    const salt = generateSalt()
    const key = await deriveKey(alarmPassword, salt)
    const { encryptionKey } = splitDerivedKey(key)
    const alarmHash = await computeVerificationHash(encryptionKey)
    webRun(`UPDATE vault SET alarm_hash = ?, alarm_salt = ?, updated_at = datetime('now') WHERE id = ?`, [alarmHash, arrayToHex(salt), activeVaultId])
    webRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('alarm_enabled', 'true')")
    if (backupEmail) {
      webRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('alarm_backup_email', ?)", [backupEmail])
    }
    await saveWebDatabase()
    return { success: true }
  },
  'vault:change-alarm': async (_: any, oldAlarm: string, newAlarm: string) => {
    const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [activeVaultId])
    if (!vault || !vault.alarm_hash || !vault.alarm_salt) return { success: false, error: 'Alarm password not set' }

    const oldSalt = hexToArray(vault.alarm_salt)
    const oldKey = await deriveKey(oldAlarm, oldSalt)
    const { encryptionKey: oldEncKey } = splitDerivedKey(oldKey)
    const oldHash = await computeVerificationHash(oldEncKey)
    if (!timingSafeStringEqual(oldHash, vault.alarm_hash)) return { success: false, error: 'Invalid alarm password' }

    const newSalt = generateSalt()
    const newKey = await deriveKey(newAlarm, newSalt)
    const { encryptionKey: newEncKey } = splitDerivedKey(newKey)
    const newHash = await computeVerificationHash(newEncKey)
    webRun(`UPDATE vault SET alarm_hash = ?, alarm_salt = ?, updated_at = datetime('now') WHERE id = ?`, [newHash, arrayToHex(newSalt), activeVaultId])
    await saveWebDatabase()
    return { success: true }
  },
  'vault:remove-alarm': async () => {
    webRun(`UPDATE vault SET alarm_hash = NULL, alarm_salt = NULL, updated_at = datetime('now') WHERE id = ?`, [activeVaultId])
    webRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('alarm_enabled', 'false')")
    await saveWebDatabase()
    return { success: true }
  },

  'vault:verify-password': async (_: any, password: string) => {
    await getWebDatabase()
    const vault = webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [activeVaultId])
    if (!vault) return false
    try {
      const salt = hexToArray(vault.kdf_salt)
      const key = await deriveKey(password, salt)
      const { encryptionKey } = splitDerivedKey(key)
      const computedHash = await computeVerificationHash(encryptionKey)
      return timingSafeStringEqual(computedHash, vault.master_hash)
    } catch {
      return false
    }
  },

  // Entries
  'entries:list': (_: any, filters?: EntryFilters) => listEntries(filters),
  'entries:get': (_: any, id: number) => getEntry(id),
  'entries:create': (_: any, data: CreateEntryPayload) => createEntry(data),
  'entries:update': (_: any, id: number, data: UpdateEntryPayload) => updateEntry(id, data),
  'entries:delete': (_: any, id: number) => deleteEntryById(id),
  'entries:restore': (_: any, id: number) => restoreEntry(id),
  'entries:permanent-delete': (_: any, id: number) => permanentDeleteEntry(id),
  'entries:deleted': () => getDeletedEntries(),
  'entries:cleanup-old': () => cleanupOldDeletedEntries(),
  'entries:search': (_: any, query: string, filters?: EntryFilters) => searchEntries(query, filters),
  'entries:toggle-favorite': (_: any, id: number) => toggleFavoriteEntry(id),
  'entries:get-history': (_: any, id: number) => getEntryHistoryList(id),
  'entries:get-decrypted-history': (_: any, id: number) => getDecryptedHistory(id),
  'entries:get-totp': (_: any, id: number) => getEntryTOTP(id),

  // Alarm mode — bypass key check
  'entries:force-list': () => forceListEntries(),
  'entries:force-delete': (_: any, id: number) => forcePermanentDeleteEntry(id),
  'entries:panic-backup': () => getPanicBackupEntries(),
  'entries:complete-panic': () => completePanic(),

  // Email
  'email:send-backup': (_: any, backupData: string) => sendBackupWeb(backupData),
  'email:test-telegram': async () => ({ ok: false, error: 'Not available in web version' }),
  'email:get-chat-id': async () => null,
  'email:save-telegram': async () => {},

  // Password
  'password:generate': (_: any, options: PasswordOptions) => Promise.resolve(generatePasswordLocal(options)),
  'password:check-breach': (_: any, password: string) => checkBreachLocal(password),
  'password:generate-username': () => Promise.resolve(generateUsernameLocal()),
  'password:generate-passphrase': (_: any, wordCount?: number) => Promise.resolve(generatePassphraseLocal(wordCount)),

  // Categories
  'categories:list': () => getCategories(),
  'categories:create': (_: any, data: CreateCategoryPayload) => createCategory(data),
  'categories:update': (_: any, id: number, data: Partial<CreateCategoryPayload>) => updateCategory(id, data),
  'categories:delete': (_: any, id: number) => deleteCategory(id),
  'categories:reorder': (_: any, ids: number[]) => reorderCategories(ids),

  // Clipboard
  'clipboard:copy': (_: any, text: string, ttl?: number) => copyToClipboard(text, ttl),
  'clipboard:clear': () => clearClipboard(),

  // Settings
  'settings:get': async (_: any, key: string) => {
    await getWebDatabase()
    const result = webQueryAll<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    return result.length > 0 ? result[0].value : null
  },
  'settings:set': async (_: any, key: string, value: string) => {
    await getWebDatabase()
    webRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
    await saveWebDatabase()
  },

  // Health
  'health:analyze': () => analyzePasswordHealthLocal(),

  // Integrity (always pass on mobile)
  'integrity:check': () => Promise.resolve({ ok: true }), // TODO: implement PRAGMA integrity_check for web

  // Stub handlers for features not supported on mobile
  'shortcut:get': () => Promise.resolve(''),
  'shortcut:set': () => Promise.resolve({ success: false, error: 'Not supported on mobile' }),
  'sync:get-status': () => Promise.resolve({ enabled: false, folder: null, lastSyncTime: 0, isSyncing: false }),
  'sync:select-folder': () => Promise.resolve({ success: false, error: 'Not supported on mobile' }),
  'sync:set-password': () => Promise.resolve(),
  'sync:now': () => Promise.resolve({ success: false, error: 'Not supported on mobile' }),
  'sync:disable': () => Promise.resolve(),
  'sync:load-settings': () => Promise.resolve({ enabled: false, folder: null }),
  'backup:export': () => Promise.resolve({ success: false, error: 'Not supported on mobile' }),
  'backup:import': () => Promise.resolve({ success: false, error: 'Not supported on mobile' }),
  'backup:import-panic': () => importPanicBackup(),
  'disposable:create': () => Promise.resolve({ id: 0, address: '' }),
  'disposable:list': () => Promise.resolve([]),
  'disposable:messages': () => Promise.resolve([]),
  'disposable:message': () => Promise.resolve({ id: '', from: '', subject: '', text: '', html: '', createdAt: '' }),
  'disposable:delete-message': () => Promise.resolve(),
  'disposable:delete-account': () => Promise.resolve(),
  'import:csv': () => importCSV(),
  'import:json': () => importJSON(),
  'export:csv': () => Promise.resolve({ success: false }),
  'export:json': () => Promise.resolve({ success: false }),
}

// ─── Import/Export (Web) ────────────────────────────────

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      if (char !== '\r') current += char
    }
  }
  result.push(current.trim())
  return result
}

function stripQuotes(s: string): string {
  return (s || '').replace(/^"(.*)"$/, '$1')
}

async function importCSV(): Promise<ImportResult> {
  const file = await pickFile('.csv')
  if (!file) return { imported: 0, skipped: 0, errors: ['Cancelled'] }

  const encKey = getEncryptionKey()
  if (!encKey) return { imported: 0, skipped: 0, errors: ['Vault is locked'] }

  let content = await file.text()
  // Strip BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

  // Parse lines (handle quoted fields with newlines)
  const lines: string[] = []
  let currentLine = ''
  let inQuotes = false
  for (const char of content) {
    if (char === '"') { inQuotes = !inQuotes; currentLine += char }
    else if (char === '\r') { /* skip */ }
    else if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine)
      currentLine = ''
    } else { currentLine += char }
  }
  if (currentLine.trim()) lines.push(currentLine)

  if (lines.length < 2) return { imported: 0, skipped: 0, errors: ['CSV file is empty or has no data rows'] }

  const header = lines[0]
  const colMap = mapColumns(header)

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i])
      const title = colMap.nameIdx >= 0 ? stripQuotes(values[colMap.nameIdx]) : `Import ${i}`
      if (!title) { skipped++; continue }

      const entryType = mapEntryType(
        colMap.typeIdx >= 0 ? values[colMap.typeIdx] : '',
        'generic'
      )

      await createEntry({
        entry_type: entryType as any,
        title,
        username: stripQuotes(colMap.userIdx >= 0 ? values[colMap.userIdx] : ''),
        password: stripQuotes(colMap.passIdx >= 0 ? values[colMap.passIdx] : ''),
        url: stripQuotes(colMap.urlIdx >= 0 ? values[colMap.urlIdx] : ''),
        notes: stripQuotes(colMap.notesIdx >= 0 ? values[colMap.notesIdx] : ''),
        totp_secret: stripQuotes(colMap.totpIdx >= 0 ? values[colMap.totpIdx] : '') || undefined,
        card_number: colMap.cardNumIdx >= 0 ? stripQuotes(values[colMap.cardNumIdx]) : undefined,
        card_holder: colMap.cardHolderIdx >= 0 ? stripQuotes(values[colMap.cardHolderIdx]) : undefined,
        card_expiry: colMap.cardExpiryIdx >= 0 ? stripQuotes(values[colMap.cardExpiryIdx]) : undefined,
        card_cvv: colMap.cardCvvIdx >= 0 ? stripQuotes(values[colMap.cardCvvIdx]) : undefined,
        identity_first_name: colMap.firstNameIdx >= 0 ? stripQuotes(values[colMap.firstNameIdx]) : undefined,
        identity_last_name: colMap.lastNameIdx >= 0 ? stripQuotes(values[colMap.lastNameIdx]) : undefined,
        identity_phone: colMap.phoneIdx >= 0 ? stripQuotes(values[colMap.phoneIdx]) : undefined,
        identity_email: colMap.emailIdx >= 0 ? stripQuotes(values[colMap.emailIdx]) : undefined,
        identity_address: colMap.addressIdx >= 0 ? stripQuotes(values[colMap.addressIdx]) : undefined,
      })
      imported++
    } catch (e: any) {
      errors.push(`Row ${i}: ${e.message}`)
      skipped++
    }
  }

  if (imported > 0) await saveWebDatabase()
  return { imported, skipped, errors }
}

async function importJSON(): Promise<ImportResult> {
  const file = await pickFile('.json')
  if (!file) return { imported: 0, skipped: 0, errors: ['Cancelled'] }

  const encKey = getEncryptionKey()
  if (!encKey) return { imported: 0, skipped: 0, errors: ['Vault is locked'] }

  try {
    const content = await file.text()
    const data = JSON.parse(content)
    const items = Array.isArray(data) ? data : data.items || data.entries || []
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Bitwarden type numbers → our type strings
    const bwTypeMap: Record<number, string> = {
      1: 'login', 2: 'secure_note', 3: 'card', 4: 'identity',
      5: 'login', 6: 'login', 7: 'login',
    }

    for (const item of items) {
      try {
        // Title: supports Bitwarden, 1Password, LastPass, generic
        const title = item.title || item.name || item.Name || ''
        if (!title) { skipped++; continue }

        // Username: Bitwarden uses item.login.username, 1Password uses item.login.Username
        const login = item.login || item.Login || {}
        const username = item.username || item.user || login.username || login.Username || ''

        // Password: same nested structure
        const password = item.password || item.Password || login.password || login.Password || ''

        // URL: Bitwarden uses login.uris[].uri, others use item.url
        let url = ''
        if (item.url) {
          url = item.url
        } else if (item.Url) {
          url = item.Url
        } else if (login.uris && Array.isArray(login.uris) && login.uris.length > 0) {
          url = login.uris[0].uri || login.uris[0].Uri || ''
        } else if (login.Uri) {
          url = login.Uri
        }

        // TOTP: Bitwarden stores in login.totp
        const totp = login.totp || login.TOTP || item.totp || ''

        // Type: Bitwarden uses numbers, others use strings
        let entryType: string
        if (typeof item.type === 'number') {
          entryType = bwTypeMap[item.type] || 'login'
        } else if (typeof item.Type === 'number') {
          entryType = bwTypeMap[item.Type] || 'login'
        } else {
          entryType = item.type || item.Type || 'login'
        }

        // Notes
        const notes = item.notes || item.Notes || item.note || ''

        // Card fields (Bitwarden nested)
        const card = item.card || item.Card || {}
        const cardNumber = card.number || card.Number || card.cardNumber || ''
        const cardHolder = card.cardholderName || card.CardholderName || card.holder || ''
        const cardExpiry = (card.expMonth && card.expYear)
          ? `${card.expMonth}/${card.expYear}`
          : (card.expirationDate || card.Expiry || '')
        const cardCvv = card.code || card.CVV || ''

        // Identity fields (Bitwarden nested)
        const identity = item.identity || item.Identity || {}
        const firstName = identity.firstName || identity.FirstName || ''
        const lastName = identity.lastName || identity.LastName || ''
        const phone = identity.phone || identity.Phone || ''
        const email = identity.email || identity.Email || ''
        const address = identity.address1 || identity.Address1 || ''
        const ssn = identity.ssn || identity.SSN || ''
        const passport = identity.passportNumber || identity.PassportNumber || ''
        const birthdate = identity.birthDate || identity.BirthDate || ''

        await createEntry({
          entry_type: entryType as any,
          title,
          username: String(username),
          password: String(password),
          url: String(url),
          notes: String(notes),
          totp_secret: totp ? String(totp) : undefined,
          card_number: cardNumber ? String(cardNumber) : undefined,
          card_holder: cardHolder ? String(cardHolder) : undefined,
          card_expiry: cardExpiry ? String(cardExpiry) : undefined,
          card_cvv: cardCvv ? String(cardCvv) : undefined,
          identity_first_name: firstName ? String(firstName) : undefined,
          identity_last_name: lastName ? String(lastName) : undefined,
          identity_phone: phone ? String(phone) : undefined,
          identity_email: email ? String(email) : undefined,
          identity_address: address ? String(address) : undefined,
          identity_ssn: ssn ? String(ssn) : undefined,
          identity_passport: passport ? String(passport) : undefined,
          identity_birthdate: birthdate ? String(birthdate) : undefined,
        })
        imported++
      } catch (e: any) {
        errors.push(`Item: ${e.message}`)
        skipped++
      }
    }

    if (imported > 0) await saveWebDatabase()
    return { imported, skipped, errors }
  } catch (e: any) {
    return { imported: 0, skipped: 0, errors: [e.message] }
  }
}

async function importPanicBackup(): Promise<{ success: boolean; error?: string; imported?: number; skipped?: number; errors?: string[] }> {
  const file = await pickFile('.enc')
  if (!file) return { success: false, error: 'Cancelled' }

  const encKey = getEncryptionKey()
  if (!encKey) return { success: false, error: 'Vault is locked' }

  // Ask for password via prompt
  const backupPassword = prompt('Enter backup password:')
  if (!backupPassword) return { success: false, error: 'Cancelled' }

  try {
    const fileContent = await file.text()
    const combined = Uint8Array.from(atob(fileContent.trim()), c => c.charCodeAt(0))

    // salt(16) + iv(12) + ciphertext+authTag
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 28)
    const encryptedData = combined.slice(28)

    // Derive key via PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(backupPassword),
      'PBKDF2',
      false,
      ['deriveKey']
    )

    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    )

    const backup = JSON.parse(new TextDecoder().decode(decrypted))
    if (backup.format !== 'ciphervault-panic-backup') {
      return { success: false, error: 'Invalid panic backup format' }
    }

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const entry of backup.entries) {
      try {
        const entryType = entry.entry_type || 'login'
        const title = entry.display_title || entry.title || ''
        if (!title) { skipped++; continue }

        await createEntry({
          entry_type: entryType,
          title,
          username: entry.username || '',
          password: entry.password || '',
          url: entry.url || '',
          notes: entry.notes || '',
          totp_secret: entry.totp_secret || '',
          card_number: entry.card_number || undefined,
          card_holder: entry.card_holder || undefined,
          card_expiry: entry.card_expiry || undefined,
          card_cvv: entry.card_cvv || undefined,
          identity_first_name: entry.identity_first_name || undefined,
          identity_last_name: entry.identity_last_name || undefined,
          identity_phone: entry.identity_phone || undefined,
          identity_email: entry.identity_email || undefined,
          identity_address: entry.identity_address || undefined,
        })
        imported++
      } catch (e: any) {
        errors.push(`Entry: ${e.message}`)
        skipped++
      }
    }

    if (imported > 0) await saveWebDatabase()
    return { success: true, imported, skipped, errors }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to decrypt panic backup' }
  }
}
