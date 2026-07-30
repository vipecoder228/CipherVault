import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import type { SyncDb } from '../db'
import { openDb } from '../db'
import { createApp } from '../app'

// authSecret must look like a hex-encoded 32-byte Argon2id output (64 hex chars)
// to pass the route's format validation — the actual derivation happens client-side.
const AUTH_SECRET_A = 'a'.repeat(64)
const AUTH_SECRET_B = 'b'.repeat(64)

describe('auth routes', () => {
  let db: SyncDb
  let app: Express

  beforeEach(() => {
    db = openDb(':memory:')
    app = createApp(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('POST /api/auth/register', () => {
    it('creates a new account', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ success: true })
    })

    it('rejects a duplicate username', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      const res = await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_B })

      expect(res.status).toBe(409)
    })

    it('rejects an invalid username', async () => {
      const res = await request(app).post('/api/auth/register').send({ username: 'a', authSecret: AUTH_SECRET_A })
      expect(res.status).toBe(400)
    })

    it('rejects a malformed authSecret', async () => {
      const res = await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: 'not-hex' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
    })

    it('logs in with correct credentials and returns a session token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })

      expect(res.status).toBe(200)
      expect(typeof res.body.token).toBe('string')
      expect(res.body.token.length).toBeGreaterThan(0)
      expect(typeof res.body.expiresAt).toBe('number')
    })

    it('rejects an unknown username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })

      expect(res.status).toBe(401)
    })

    it('rejects a wrong authSecret', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_B, deviceId: 'dev-1', deviceName: 'Laptop' })

      expect(res.status).toBe(401)
    })

    it('returns an empty otherSessions list on first login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })

      expect(res.body.otherSessions).toEqual([])
    })

    it('lists other active sessions but not the device logging in', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-2', deviceName: 'Phone' })

      expect(res.body.otherSessions).toEqual([
        expect.objectContaining({ deviceId: 'dev-1', deviceName: 'Laptop' }),
      ])
    })
  })

  describe('GET /api/auth/sessions', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/auth/sessions')
      expect(res.status).toBe(401)
    })

    it('lists all active sessions for the account, including the caller', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-2', deviceName: 'Phone' })
      const token = login2.body.token as string

      const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.sessions).toHaveLength(2)
      expect(res.body.sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ deviceId: 'dev-1', deviceName: 'Laptop' }),
          expect.objectContaining({ deviceId: 'dev-2', deviceName: 'Phone' }),
        ])
      )
    })

    it('does not include another account\'s sessions', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      await request(app).post('/api/auth/register').send({ username: 'bob', authSecret: AUTH_SECRET_B })
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'bob', authSecret: AUTH_SECRET_B, deviceId: 'bob-dev', deviceName: 'Bob Laptop' })
      const aliceLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      const token = aliceLogin.body.token as string

      const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.sessions).toEqual([expect.objectContaining({ deviceId: 'dev-1' })])
    })
  })

  describe('DELETE /api/auth/sessions/:deviceId', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete('/api/auth/sessions/dev-1')
      expect(res.status).toBe(401)
    })

    it('revokes the target device session, invalidating its token', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-2', deviceName: 'Phone' })
      const token1 = login1.body.token as string
      const token2 = login2.body.token as string

      const revokeRes = await request(app)
        .delete('/api/auth/sessions/dev-1')
        .set('Authorization', `Bearer ${token2}`)
      expect(revokeRes.status).toBe(204)

      const pullRes = await request(app).get('/api/vault').set('Authorization', `Bearer ${token1}`)
      expect(pullRes.status).toBe(401)

      const stillWorks = await request(app).get('/api/vault').set('Authorization', `Bearer ${token2}`)
      expect(stillWorks.status).not.toBe(401)
    })

    it('cannot revoke a device belonging to another account', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      await request(app).post('/api/auth/register').send({ username: 'bob', authSecret: AUTH_SECRET_B })
      const bobLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'bob', authSecret: AUTH_SECRET_B, deviceId: 'bob-dev', deviceName: 'Bob Laptop' })
      const aliceLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      const bobToken = bobLogin.body.token as string
      const aliceToken = aliceLogin.body.token as string

      const revokeRes = await request(app)
        .delete('/api/auth/sessions/bob-dev')
        .set('Authorization', `Bearer ${aliceToken}`)
      expect(revokeRes.status).toBe(204)

      const bobStillWorks = await request(app).get('/api/vault').set('Authorization', `Bearer ${bobToken}`)
      expect(bobStillWorks.status).not.toBe(401)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/auth/logout')
      expect(res.status).toBe(401)
    })

    it('deletes the current session so the token can no longer be used', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      const token = login.body.token as string

      const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)
      expect(logoutRes.status).toBe(204)

      const pullRes = await request(app).get('/api/vault').set('Authorization', `Bearer ${token}`)
      expect(pullRes.status).toBe(401)
    })
  })

  describe('DELETE /api/auth/account', () => {
    it('requires authentication', async () => {
      const res = await request(app).delete('/api/auth/account')
      expect(res.status).toBe(401)
    })

    it('removes the account and its vault blob', async () => {
      await request(app).post('/api/auth/register').send({ username: 'alice', authSecret: AUTH_SECRET_A })
      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      const token = login.body.token as string

      await request(app)
        .put('/api/vault')
        .set('Authorization', `Bearer ${token}`)
        .send({ blob: 'ciphertext', expectedVersion: 0 })

      const deleteRes = await request(app).delete('/api/auth/account').set('Authorization', `Bearer ${token}`)
      expect(deleteRes.status).toBe(204)

      const reLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', authSecret: AUTH_SECRET_A, deviceId: 'dev-1', deviceName: 'Laptop' })
      expect(reLogin.status).toBe(401)
    })
  })
})
