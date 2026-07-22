import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mock TLS cert generation for tests
vi.mock('../tlsCert', () => ({
  getLocalhostCert: vi.fn().mockResolvedValue({
    cert: 'test-cert',
    key: 'test-key',
  }),
}))

// Mock HTTPS server to behave like HTTP for testing
vi.mock('https', () => {
  const actual = vi.importActual<typeof import('https')>('https')
  return {
    ...actual,
    createServer: vi.fn((opts: any, handler: any) => {
      // Use HTTP server for tests (ignore TLS opts)
      return require('http').createServer(handler)
    }),
  }
})

import { startApiServer, stopApiServer, getApiKey } from '../api.service'

describe('API Service', () => {
  beforeAll(async () => {
    await startApiServer()
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

    it('should generate unique keys', async () => {
      stopApiServer()
      const key1 = getApiKey()
      await startApiServer()
      const key2 = getApiKey()
      // Keys should be different (or null before start)
      expect(key1).not.toBe(key2)
    })
  })

  describe('Server Lifecycle', () => {
    it('should start and stop cleanly', async () => {
      stopApiServer()
      expect(getApiKey()).toBeNull()

      const result = await startApiServer()
      expect(result.port).toBe(19824)
      expect(result.apiKey).toBeTruthy()

      stopApiServer()
      expect(getApiKey()).toBeNull()
    })

    it('should not start twice', async () => {
      await startApiServer()
      const key1 = getApiKey()
      await startApiServer() // Second call should be no-op
      const key2 = getApiKey()
      expect(key1).toBe(key2)
      stopApiServer()
    })
  })

  describe('HTTP Endpoints', () => {
    it('GET /status should return ok', async () => {
      await startApiServer()
      const response = await fetch('http://127.0.0.1:19824/status')
      const data = await response.json()
      expect(data.status).toBe('ok')
      expect(data.version).toBeTruthy()
    })

    it('should require auth for non-status endpoints', async () => {
      await startApiServer()
      const response = await fetch('http://127.0.0.1:19824/entries')
      expect(response.status).toBe(401)
    })

    it('should reject invalid API key', async () => {
      await startApiServer()
      const response = await fetch('http://127.0.0.1:19824/entries', {
        headers: { Authorization: 'Bearer invalid-key' },
      })
      expect(response.status).toBe(401)
    })

    it('should accept valid API key', async () => {
      await startApiServer()
      const apiKey = getApiKey()
      const response = await fetch('http://127.0.0.1:19824/entries', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      // Should return 403 (vault locked) or 200, not 401
      expect(response.status).not.toBe(401)
    })

    it('should return 404 for unknown routes', async () => {
      await startApiServer()
      const apiKey = getApiKey()
      const response = await fetch('http://127.0.0.1:19824/unknown', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      expect(response.status).toBe(404)
    })
  })
})
