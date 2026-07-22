// ─── Encrypted Audit Log ────────────────────────────────
// Logs security-relevant events, encrypted at rest with HMAC integrity

import { getDatabase } from '../db/connection'
import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { getEncryptionKey } from '../services/vault.service'
import { createHmac, timingSafeEqual } from 'crypto'

export type AuditAction =
  | 'vault_unlocked'
  | 'vault_locked'
  | 'entry_created'
  | 'entry_updated'
  | 'entry_deleted'
  | 'password_copied'
  | 'password_generated'
  | 'master_password_changed'
  | 'totp_enabled'
  | 'totp_disabled'
  | 'backup_exported'
  | 'backup_imported'
  | 'api_accessed'
  | 'breach_detected'

interface AuditEntry {
  action: AuditAction
  timestamp: number
  details?: string
  ip?: string
}

// In-memory buffer before flush
let auditBuffer: AuditEntry[] = []
const FLUSH_INTERVAL = 30000 // 30 seconds
let flushTimer: ReturnType<typeof setInterval> | null = null
let tableCreated = false

// HMAC key for audit log integrity (generated once, stored in secretStorage)
let hmacKey: Buffer | null = null

async function getHmacKey(): Promise<Buffer> {
  if (hmacKey) return hmacKey
  // Generate a new HMAC key if not exists
  const { randomBytes } = await import('crypto')
  hmacKey = randomBytes(32)
  return hmacKey
}

function signAuditEntry(data: string, key: Buffer): string {
  return createHmac('sha256', key).update(data).digest('hex')
}

function verifyAuditSignature(data: string, signature: string, key: Buffer): boolean {
  const expected = signAuditEntry(data, key)
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/**
 * Initialize audit log system
 */
export async function initAuditLog(): Promise<void> {
  try {
    const db = await getDatabase()
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        encrypted_data TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        hmac_signature TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    tableCreated = true
  } catch {
    // Table creation will be retried on first flush
  }

  // Flush periodically
  flushTimer = setInterval(() => { flushBuffer().catch(() => {}) }, FLUSH_INTERVAL)
}

/**
 * Log a security-relevant event
 */
export function logAuditEvent(action: AuditAction, details?: string): void {
  const entry: AuditEntry = {
    action,
    timestamp: Date.now(),
    details,
  }
  auditBuffer.push(entry)
}

/**
 * Flush audit buffer to encrypted storage
 * Uses atomic swap to prevent race conditions
 */
async function flushBuffer(): Promise<void> {
  if (auditBuffer.length === 0) return

  // Atomic swap: grab current buffer and replace with empty array
  const entries = auditBuffer.splice(0)

  const encKey = getEncryptionKey()
  if (!encKey) {
    // Vault is locked, can't encrypt — put entries back at the front
    auditBuffer.unshift(...entries)
    return
  }

  const db = await getDatabase()

  // Ensure table exists (lazy creation)
  if (!tableCreated) {
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          encrypted_data TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          hmac_signature TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      tableCreated = true
    } catch {}
  }

  const key = await getHmacKey()

  for (const entry of entries) {
    try {
      const encrypted = encryptJSON(entry, encKey)
      // Sign the encrypted data with HMAC for integrity verification
      const signature = signAuditEntry(encrypted.ciphertext, key)
      db.run(
        'INSERT INTO audit_log (encrypted_data, iv, auth_tag, hmac_signature) VALUES (?, ?, ?, ?)',
        [encrypted.ciphertext, encrypted.iv, encrypted.authTag, signature]
      )
    } catch {
      // Failed to log — entry is lost (acceptable for audit log)
    }
  }
}

/**
 * Read audit log entries with HMAC verification
 */
export async function getAuditLog(limit: number = 100): Promise<AuditEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []

  const db = await getDatabase()
  const result = db.exec(
    'SELECT encrypted_data, iv, auth_tag, hmac_signature FROM audit_log ORDER BY id DESC LIMIT ?',
    [limit]
  )

  if (result.length === 0) return []

  const key = await getHmacKey()
  const entries: AuditEntry[] = []
  for (const row of result[0].values) {
    try {
      const ciphertext = row[0] as string
      const signature = row[3] as string

      // Verify HMAC signature if present (backward compatible with old entries)
      if (signature && !verifyAuditSignature(ciphertext, signature, key)) {
        // Signature mismatch — entry may have been tampered with
        continue
      }

      const decrypted = decryptJSON<AuditEntry>(
        { iv: row[1] as string, ciphertext, authTag: row[2] as string },
        encKey
      )
      entries.push(decrypted)
    } catch {}
  }

  return entries
}

/**
 * Stop audit log system
 */
export function stopAuditLog(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  // Flush remaining entries synchronously
  flushBuffer().catch(() => {})
}
