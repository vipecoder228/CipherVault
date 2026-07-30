import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import type { SyncDb } from '../db'
import { openDb } from '../db'
import { createApp } from '../app'

const AUTH_SECRET = 'c'.repeat(64)

async function registerAndLogin(app: Express, deviceId: string, deviceName: string): Promise<string> {
  await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET })
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'alice', authSecret: AUTH_SECRET, deviceId, deviceName })
  return login.body.token as string
}

describe('vault routes', () => {
  let db: SyncDb
  let app: Express

  beforeEach(() => {
    db = openDb(':memory:')
    app = createApp(db)
  })

  afterEach(() => {
    db.close()
  })

  it('requires authentication for all routes', async () => {
    expect((await request(app).get('/api/vault')).status).toBe(401)
    expect((await request(app).put('/api/vault').send({ blob: 'x', expectedVersion: 0 })).status).toBe(401)
    expect((await request(app).delete('/api/vault')).status).toBe(401)
  })

  it('returns 404 when nothing has been pushed yet', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    const res = await request(app).get('/api/vault').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('accepts the first push with expectedVersion 0 and returns version 1', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    const res = await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ blob: 'envelope-v1', expectedVersion: 0 })

    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
    expect(typeof res.body.updatedAt).toBe('number')
  })

  it('round-trips a pushed blob through GET', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ blob: 'envelope-v1', expectedVersion: 0 })

    const res = await request(app).get('/api/vault').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.blob).toBe('envelope-v1')
    expect(res.body.version).toBe(1)
    expect(res.body.deviceId).toBe('dev-1')
    expect(res.body.deviceName).toBe('Laptop')
  })

  it('accepts a second push when expectedVersion matches the current version', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    await request(app).put('/api/vault').set('Authorization', `Bearer ${token}`).send({ blob: 'v1', expectedVersion: 0 })

    const res = await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ blob: 'v2', expectedVersion: 1 })

    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2)
  })

  it('returns 409 with conflict details when expectedVersion is stale', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    await request(app).put('/api/vault').set('Authorization', `Bearer ${token}`).send({ blob: 'v1', expectedVersion: 0 })

    const res = await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ blob: 'v2-conflicting', expectedVersion: 0 })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('conflict')
    expect(res.body.currentVersion).toBe(1)
    expect(res.body.deviceId).toBe('dev-1')
    expect(res.body.deviceName).toBe('Laptop')

    // The stale push must not have overwritten the stored blob.
    const getRes = await request(app).get('/api/vault').set('Authorization', `Bearer ${token}`)
    expect(getRes.body.blob).toBe('v1')
  })

  it('rejects a missing or empty blob', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    const res = await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ blob: '', expectedVersion: 0 })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid expectedVersion', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    const res = await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ blob: 'x', expectedVersion: -1 })
    expect(res.status).toBe(400)
  })

  it('deletes the vault blob', async () => {
    const token = await registerAndLogin(app, 'dev-1', 'Laptop')
    await request(app).put('/api/vault').set('Authorization', `Bearer ${token}`).send({ blob: 'v1', expectedVersion: 0 })

    const delRes = await request(app).delete('/api/vault').set('Authorization', `Bearer ${token}`)
    expect(delRes.status).toBe(204)

    const getRes = await request(app).get('/api/vault').set('Authorization', `Bearer ${token}`)
    expect(getRes.status).toBe(404)
  })

  it('lets a second device push after pulling, updating device attribution', async () => {
    const tokenA = await registerAndLogin(app, 'dev-1', 'Laptop')
    await request(app).put('/api/vault').set('Authorization', `Bearer ${tokenA}`).send({ blob: 'v1', expectedVersion: 0 })

    const loginB = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', authSecret: AUTH_SECRET, deviceId: 'dev-2', deviceName: 'Phone' })
    const tokenB = loginB.body.token as string

    const res = await request(app)
      .put('/api/vault')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ blob: 'v2-from-phone', expectedVersion: 1 })

    expect(res.status).toBe(200)
    const getRes = await request(app).get('/api/vault').set('Authorization', `Bearer ${tokenB}`)
    expect(getRes.body.deviceId).toBe('dev-2')
    expect(getRes.body.deviceName).toBe('Phone')
  })
})
