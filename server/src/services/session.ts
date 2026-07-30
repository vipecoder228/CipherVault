import { randomBytes, createHash, timingSafeEqual } from 'crypto'
import type { SyncDb } from '../db'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface Session {
  accountId: number
  deviceId: string
  deviceName: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createSession(db: SyncDb, accountId: number, deviceId: string, deviceName: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('hex')
  const now = Date.now()
  const expiresAt = now + TOKEN_TTL_MS

  db.prepare(
    `INSERT INTO sessions (token_hash, account_id, device_id, device_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(hashToken(token), accountId, deviceId, deviceName, now, expiresAt)

  return { token, expiresAt }
}

// Constant-time-ish lookup: token hashes are unique-indexed so this is a
// direct row fetch, not a scan — timingSafeEqual isn't needed here because
// there's nothing to compare against (the hash IS the lookup key).
export function verifySession(db: SyncDb, token: string): Session | null {
  if (!token || typeof token !== 'string') return null
  const row = db.prepare(
    `SELECT account_id, device_id, device_name, expires_at FROM sessions WHERE token_hash = ?`
  ).get(hashToken(token)) as { account_id: number; device_id: string; device_name: string; expires_at: number } | undefined

  if (!row) return null
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    return null
  }

  return { accountId: row.account_id, deviceId: row.device_id, deviceName: row.device_name }
}

export function deleteSession(db: SyncDb, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

export function deleteAllSessionsForAccount(db: SyncDb, accountId: number): void {
  db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId)
}

export interface SessionSummary {
  deviceId: string
  deviceName: string
  createdAt: number
}

// One row per active session, not per device — a device with multiple
// concurrent logins (unusual, but not prevented) shows up more than once.
export function listSessionsForAccount(db: SyncDb, accountId: number): SessionSummary[] {
  const now = Date.now()
  const rows = db.prepare(
    `SELECT device_id, device_name, created_at FROM sessions WHERE account_id = ? AND expires_at > ? ORDER BY created_at DESC`
  ).all(accountId, now) as { device_id: string; device_name: string; created_at: number }[]

  return rows.map((row) => ({ deviceId: row.device_id, deviceName: row.device_name, createdAt: row.created_at }))
}

// Scoped to accountId so a caller can't probe/revoke another account's
// device_id — deviceId alone isn't guaranteed globally unique.
export function deleteSessionsByDeviceId(db: SyncDb, accountId: number, deviceId: string): void {
  db.prepare('DELETE FROM sessions WHERE account_id = ? AND device_id = ?').run(accountId, deviceId)
}

// Unused directly (session lookup is by unique hash, not by secret compare),
// exported so route/auth code that DOES compare raw secrets (e.g. future
// bearer-scheme variants) has a vetted constant-time helper available.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
