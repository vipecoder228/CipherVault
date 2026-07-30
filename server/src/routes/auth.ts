import { Router } from 'express'
import { hash as argon2Hash, verify as argon2Verify } from 'argon2'
import type { SyncDb } from '../db'
import {
  createSession,
  deleteAllSessionsForAccount,
  deleteSession,
  listSessionsForAccount,
  deleteSessionsByDeviceId,
} from '../services/session'
import { requireAuth } from '../middleware/auth'
import type { RegisterRequest, LoginRequest } from '../../../shared/syncProtocol'

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,64}$/
// authSecret is a hex-encoded 32-byte Argon2id output (see shared/crypto/keyderivation.ts deriveKeyArgon2id32) — always exactly 64 hex chars.
const AUTH_SECRET_RE = /^[0-9a-f]{64}$/

function isValidUsername(v: unknown): v is string {
  return typeof v === 'string' && USERNAME_RE.test(v)
}

function isValidAuthSecret(v: unknown): v is string {
  return typeof v === 'string' && AUTH_SECRET_RE.test(v)
}

function isValidDeviceField(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 128
}

export function createAuthRouter(db: SyncDb): Router {
  const router = Router()

  router.post('/register', async (req, res) => {
    const body = req.body as RegisterRequest
    if (!isValidUsername(body?.username) || !isValidAuthSecret(body?.authSecret)) {
      return res.status(400).json({ error: 'Invalid username or authSecret' })
    }

    const existing = db.prepare('SELECT id FROM accounts WHERE username = ?').get(body.username)
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' })
    }

    const authHash = await argon2Hash(body.authSecret)
    db.prepare('INSERT INTO accounts (username, auth_hash, created_at) VALUES (?, ?, ?)')
      .run(body.username, authHash, Date.now())

    res.status(201).json({ success: true })
  })

  router.post('/login', async (req, res) => {
    const body = req.body as LoginRequest
    if (
      !isValidUsername(body?.username) ||
      !isValidAuthSecret(body?.authSecret) ||
      !isValidDeviceField(body?.deviceId) ||
      !isValidDeviceField(body?.deviceName)
    ) {
      return res.status(400).json({ error: 'Invalid login payload' })
    }

    const account = db.prepare('SELECT id, auth_hash FROM accounts WHERE username = ?')
      .get(body.username) as { id: number; auth_hash: string } | undefined

    // Always run argon2Verify with a dummy hash on miss so response timing
    // doesn't reveal whether the username exists.
    const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const ok = account
      ? await argon2Verify(account.auth_hash, body.authSecret).catch(() => false)
      : await argon2Verify(DUMMY_HASH, body.authSecret).catch(() => false).then(() => false)

    if (!account || !ok) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    // Snapshot other active sessions before creating this one, so the newly
    // logging-in device isn't listed as an "other" session of itself.
    const otherSessions = listSessionsForAccount(db, account.id)
      .filter((s) => s.deviceId !== body.deviceId)
      .map((s) => ({ deviceId: s.deviceId, deviceName: s.deviceName, createdAt: s.createdAt }))

    const { token, expiresAt } = createSession(db, account.id, body.deviceId, body.deviceName)
    res.json({ token, expiresAt, otherSessions })
  })

  router.post('/logout', requireAuth(db), (req, res) => {
    const token = (req as any).sessionToken as string
    deleteSession(db, token)
    res.status(204).end()
  })

  router.get('/sessions', requireAuth(db), (req, res) => {
    const accountId = (req as any).session.accountId as number
    const sessions = listSessionsForAccount(db, accountId)
    res.json({ sessions })
  })

  router.delete('/sessions/:deviceId', requireAuth(db), (req, res) => {
    const accountId = (req as any).session.accountId as number
    const deviceId = req.params.deviceId
    if (!isValidDeviceField(deviceId)) {
      return res.status(400).json({ error: 'Invalid deviceId' })
    }
    deleteSessionsByDeviceId(db, accountId, deviceId)
    res.status(204).end()
  })

  router.delete('/account', requireAuth(db), (req, res) => {
    const accountId = (req as any).session.accountId as number
    db.prepare('DELETE FROM vault_blobs WHERE account_id = ?').run(accountId)
    deleteAllSessionsForAccount(db, accountId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
    res.status(204).end()
  })

  return router
}
