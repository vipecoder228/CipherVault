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
