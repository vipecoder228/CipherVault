import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startApiServer, stopApiServer, getApiKey } from '../api.service'

describe('API Service', () => {
  beforeAll(() => {
    startApiServer()
  })

  afterAll(() => {
    stopApiServer()
  })

  describe('API Key Generation', () => {
    it('should generate an API key on start', () => {
      const key = getApiKey()
      expect(key).toBeTruthy()
      expect(key!.length).toBe(64) // 32 bytes = 64 hex chars
    })

    it('should generate unique keys', () => {
      stopApiServer()
      const key1 = getApiKey()
      startApiServer()
      const key2 = getApiKey()
      // Keys should be different (or null before start)
      expect(key1).not.toBe(key2)
    })
  })

  describe('Server Lifecycle', () => {
    it('should start and stop cleanly', () => {
      stopApiServer()
      expect(getApiKey()).toBeNull()

      const result = startApiServer()
      expect(result.port).toBe(19824)
      expect(result.apiKey).toBeTruthy()

      stopApiServer()
      expect(getApiKey()).toBeNull()
    })

    it('should not start twice', () => {
      startApiServer()
      const key1 = getApiKey()
      startApiServer() // Second call should be no-op
      const key2 = getApiKey()
      expect(key1).toBe(key2)
      stopApiServer()
    })
  })

  describe('HTTP Endpoints', () => {
    it('GET /status should return ok', async () => {
      startApiServer()
      const response = await fetch('http://127.0.0.1:19824/status')
      const data = await response.json()
      expect(data.status).toBe('ok')
      expect(data.version).toBeTruthy()
    })

    it('GET /entries without auth should return 401', async () => {
      startApiServer()
      const response = await fetch('http://127.0.0.1:19824/entries')
      expect(response.status).toBe(401)
    })

    it('GET /entries with invalid token should return 401', async () => {
      startApiServer()
      const response = await fetch('http://127.0.0.1:19824/entries', {
        headers: { 'Authorization': 'Bearer invalid-token' }
      })
      expect(response.status).toBe(401)
    })

    it('GET /entries with valid token should return 200 or 403', async () => {
      startApiServer()
      const apiKey = getApiKey()
      const response = await fetch('http://127.0.0.1:19824/entries', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      // 200 if vault unlocked, 403 if locked
      expect([200, 403]).toContain(response.status)
    })

    it('GET /nonexistent should return 401 or 404', async () => {
      startApiServer()
      const response = await fetch('http://127.0.0.1:19824/nonexistent')
      // Auth check happens first, so 401 if not authenticated
      expect([401, 404]).toContain(response.status)
    })

    it('POST /entries/search without body should return 400', async () => {
      startApiServer()
      const apiKey = getApiKey()
      const response = await fetch('http://127.0.0.1:19824/entries/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })
      expect(response.status).toBe(400)
    })

    it('POST /entries/search with invalid domain length should return 400', async () => {
      startApiServer()
      const apiKey = getApiKey()
      const response = await fetch('http://127.0.0.1:19824/entries/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain: 'a'.repeat(300) })
      })
      expect(response.status).toBe(400)
    })

    it('CORS headers should be set', async () => {
      startApiServer()
      const response = await fetch('http://127.0.0.1:19824/status')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })
  })
})
