// ─── Encrypted Audit Log ────────────────────────────────
// Logs security-relevant events, encrypted at rest

import { getDatabase } from '../db/connection'
import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { getEncryptionKey } from '../services/vault.service'

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

/**
 * Initialize audit log system
 */
export function initAuditLog(): void {
  const db = getDatabaseSync()
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      encrypted_data TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Flush periodically
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL)
}

function getDatabaseSync(): any {
  // Synchronous access for audit log initialization
  // This is a simplified version - in production, use the main DB connection
  return { run: () => {} }
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
 */
async function flushBuffer(): Promise<void> {
  if (auditBuffer.length === 0) return

  const encKey = getEncryptionKey()
  if (!encKey) {
    // Vault is locked, can't encrypt - keep in buffer
    return
  }

  const db = await getDatabase()
  const entries = [...auditBuffer]
  auditBuffer = []

  for (const entry of entries) {
    try {
      const encrypted = encryptJSON(entry, encKey)
      db.run(
        'INSERT INTO audit_log (encrypted_data, iv, auth_tag) VALUES (?, ?, ?)',
        [encrypted.ciphertext, encrypted.iv, encrypted.authTag]
      )
    } catch {
      // Failed to log - silently continue
    }
  }
}

/**
 * Read audit log entries
 */
export async function getAuditLog(limit: number = 100): Promise<AuditEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []

  const db = await getDatabase()
  const result = db.exec(
    'SELECT encrypted_data, iv, auth_tag FROM audit_log ORDER BY id DESC LIMIT ?',
    [limit]
  )

  if (result.length === 0) return []

  const entries: AuditEntry[] = []
  for (const row of result[0].values) {
    try {
      const decrypted = decryptJSON<AuditEntry>(
        { iv: row[1] as string, ciphertext: row[0] as string, authTag: row[2] as string },
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
  // Flush remaining entries
  flushBuffer().catch(() => {})
}
