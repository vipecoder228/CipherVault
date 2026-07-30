import { Router } from 'express'
import type { SyncDb } from '../db'
import type { PushVaultRequest } from '../../../shared/syncProtocol'

const MAX_BLOB_SIZE = 64 * 1024 * 1024 // 64 MB — generous ceiling for a whole encrypted vault DB

export function createVaultRouter(db: SyncDb): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const accountId = (req as any).session.accountId as number
    const row = db.prepare(
      'SELECT blob, version, updated_at, device_id, device_name FROM vault_blobs WHERE account_id = ?'
    ).get(accountId) as { blob: string; version: number; updated_at: number; device_id: string; device_name: string } | undefined

    if (!row) {
      res.status(404).json({ error: 'No vault blob pushed yet' })
      return
    }

    res.json({
      blob: row.blob,
      version: row.version,
      updatedAt: row.updated_at,
      deviceId: row.device_id,
      deviceName: row.device_name,
    })
  })

  router.put('/', (req, res) => {
    const accountId = (req as any).session.accountId as number
    const { deviceId, deviceName } = (req as any).session
    const body = req.body as PushVaultRequest

    if (typeof body?.blob !== 'string' || body.blob.length === 0) {
      res.status(400).json({ error: 'Missing blob' })
      return
    }
    if (body.blob.length > MAX_BLOB_SIZE) {
      res.status(413).json({ error: 'Blob too large' })
      return
    }
    if (typeof body?.expectedVersion !== 'number' || body.expectedVersion < 0) {
      res.status(400).json({ error: 'Invalid expectedVersion' })
      return
    }

    const existing = db.prepare(
      'SELECT version, updated_at, device_id, device_name FROM vault_blobs WHERE account_id = ?'
    ).get(accountId) as { version: number; updated_at: number; device_id: string; device_name: string } | undefined

    const currentVersion = existing?.version ?? 0
    if (body.expectedVersion !== currentVersion) {
      res.status(409).json({
        error: 'conflict',
        currentVersion,
        updatedAt: existing?.updated_at ?? 0,
        deviceId: existing?.device_id ?? '',
        deviceName: existing?.device_name ?? '',
      })
      return
    }

    const newVersion = currentVersion + 1
    const updatedAt = Date.now()

    db.prepare(
      `INSERT INTO vault_blobs (account_id, blob, version, updated_at, device_id, device_name)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         blob = excluded.blob, version = excluded.version, updated_at = excluded.updated_at,
         device_id = excluded.device_id, device_name = excluded.device_name`
    ).run(accountId, body.blob, newVersion, updatedAt, deviceId, deviceName)

    res.json({ version: newVersion, updatedAt })
  })

  router.delete('/', (req, res) => {
    const accountId = (req as any).session.accountId as number
    db.prepare('DELETE FROM vault_blobs WHERE account_id = ?').run(accountId)
    res.status(204).end()
  })

  return router
}
