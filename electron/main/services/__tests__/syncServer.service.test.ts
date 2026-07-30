import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
}))

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return {
    ...actual,
    createCipheriv: vi.fn(),
    createDecipheriv: vi.fn(),
  }
})

vi.mock('../../db/connection', () => ({
  getDatabasePath: vi.fn().mockReturnValue('/mock/vault.db'),
  saveDatabase: vi.fn(),
  getDatabase: vi.fn(),
  resetDatabase: vi.fn(),
}))

vi.mock('../../../../shared/crypto/keyderivation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../shared/crypto/keyderivation')>()
  return {
    ...actual,
    deriveKeyArgon2id32: vi.fn().mockResolvedValue(new Uint8Array(32).fill(7)),
    generateSalt: vi.fn().mockReturnValue(new Uint8Array(32).fill(9)),
  }
})

vi.mock('../secretStorage', () => ({
  saveSecret: vi.fn(),
  getSecret: vi.fn().mockResolvedValue(null),
  clearSecret: vi.fn(),
}))

// ─── Imports (after mocks) ──────────────────────────────
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { createCipheriv, createDecipheriv } from 'crypto'
import { getDatabase, saveDatabase, resetDatabase } from '../../db/connection'
import { saveSecret, getSecret, clearSecret } from '../secretStorage'

function makeMockDb(rows: Record<string, string> = {}) {
  return {
    exec: vi.fn((sql: string, params?: any[]) => {
      const key = params?.[0]
      if (typeof key === 'string' && key in rows) {
        return [{ columns: ['value'], values: [[rows[key]]] }]
      }
      return []
    }),
    run: vi.fn(),
  }
}

function makeMockCipher() {
  return {
    update: vi.fn().mockReturnValue(Buffer.from('encrypted-db')),
    final: vi.fn().mockReturnValue(Buffer.alloc(0)),
    getAuthTag: vi.fn().mockReturnValue(Buffer.alloc(16, 1)),
  }
}

function makeMockDecipher(plaintext: Buffer) {
  return {
    update: vi.fn().mockReturnValue(plaintext),
    final: vi.fn().mockReturnValue(Buffer.alloc(0)),
    setAuthTag: vi.fn(),
  }
}

function mockFetchOnce(status: number, body: any) {
  vi.mocked(fetch).mockResolvedValueOnce({
    status,
    json: () => Promise.resolve(body),
  } as any)
}

// Builds a well-formed CVSB envelope (magic + salt(32) + iv(12) + ciphertext + authTag(16))
// so decryptVaultBlob's header parsing succeeds regardless of createDecipheriv's mocked output.
function makeEnvelope(ciphertextLen = 8): string {
  const magic = Buffer.from('CVSB', 'ascii')
  const salt = Buffer.alloc(32, 2)
  const iv = Buffer.alloc(12, 3)
  const ciphertext = Buffer.alloc(ciphertextLen, 4)
  const authTag = Buffer.alloc(16, 5)
  return Buffer.concat([magic, salt, iv, ciphertext, authTag]).toString('base64')
}

async function freshService() {
  vi.resetModules()
  return import('../syncServer.service')
}

describe('syncServer.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(getDatabase).mockResolvedValue(makeMockDb() as any)
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('db-data'))
    vi.mocked(createCipheriv).mockReturnValue(makeMockCipher() as any)
    vi.mocked(createDecipheriv).mockReturnValue(makeMockDecipher(Buffer.from('decrypted-db')) as any)
  })

  describe('configureServer', () => {
    it('normalizes and persists a valid URL', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')

      const status = svc.getSyncServerStatus()
      expect(status.configured).toBe(true)
      expect(status.serverUrl).toBe('http://localhost:8787/')
    })

    it('rejects an invalid URL', async () => {
      const svc = await freshService()
      await expect(svc.configureServer('not-a-url')).rejects.toThrow('Неверный адрес сервера')
    })
  })

  describe('registerAccount', () => {
    it('fails when server is not configured', async () => {
      const svc = await freshService()
      const result = await svc.registerAccount('alice', 'pw')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('succeeds on 201', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(201, { success: true })

      const result = await svc.registerAccount('alice', 'pw')
      expect(result).toEqual({ success: true })
    })

    it('reports username taken on 409', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(409, { error: 'conflict' })

      const result = await svc.registerAccount('alice', 'pw')
      expect(result).toEqual({ success: false, error: 'Это имя пользователя уже занято' })
    })
  })

  describe('loginAccount', () => {
    it('fails when server is not configured', async () => {
      const svc = await freshService()
      const result = await svc.loginAccount('alice', 'pw', 'my-device')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('stores session token and settings on success', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })

      const result = await svc.loginAccount('alice', 'pw', 'my-device')
      expect(result).toEqual({ success: true })
      expect(saveSecret).toHaveBeenCalledWith('sync_server_token', 'tok-123')

      const status = svc.getSyncServerStatus()
      expect(status.loggedIn).toBe(true)
      expect(status.username).toBe('alice')
      expect(status.deviceName).toBe('my-device')
      expect(status.deviceId).toBeTruthy()
    })

    it('reports invalid credentials on non-200', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(401, { error: 'invalid' })

      const result = await svc.loginAccount('alice', 'wrong-pw', 'my-device')
      expect(result).toEqual({ success: false, error: 'Неверное имя пользователя или пароль' })
    })
  })

  describe('logoutAccount', () => {
    it('clears local session state even if the network request fails', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
      await svc.logoutAccount()

      expect(clearSecret).toHaveBeenCalledWith('sync_server_token')
      const status = svc.getSyncServerStatus()
      expect(status.loggedIn).toBe(false)
      expect(status.username).toBeNull()
    })
  })

  describe('deleteAccount', () => {
    it('fails when not configured', async () => {
      const svc = await freshService()
      const result = await svc.deleteAccount()
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('fails when not logged in', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      const result = await svc.deleteAccount()
      expect(result).toEqual({ success: false, error: 'Вы не авторизованы на сервере синхронизации' })
    })

    it('clears local session state on 204', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(204, undefined)
      const result = await svc.deleteAccount()

      expect(result).toEqual({ success: true })
      expect(clearSecret).toHaveBeenCalledWith('sync_server_token')
      const status = svc.getSyncServerStatus()
      expect(status.loggedIn).toBe(false)
      expect(status.username).toBeNull()
    })

    it('keeps local session state when the server request fails', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
      const result = await svc.deleteAccount()

      expect(result.success).toBe(false)
      expect(clearSecret).not.toHaveBeenCalledWith('sync_server_token')
      expect(svc.getSyncServerStatus().loggedIn).toBe(true)
    })
  })

  describe('pushVault', () => {
    it('fails when not configured', async () => {
      const svc = await freshService()
      const result = await svc.pushVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('fails when not logged in', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      const result = await svc.pushVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'Вы не авторизованы на сервере синхронизации' })
    })

    it('updates the local version on success', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(200, { version: 1, updatedAt: 1234 })
      const result = await svc.pushVault('sync-pw')

      expect(result).toEqual({ success: true })
      expect(saveDatabase).toHaveBeenCalled()

      const status = svc.getSyncServerStatus()
      expect(status.lastSeenVersion).toBe(1)
      expect(status.lastSyncTime).toBe(1234)
    })

    it('returns conflict details on 409 without advancing local version', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(409, {
        error: 'conflict',
        currentVersion: 5,
        updatedAt: 9999,
        deviceId: 'other-device-id',
        deviceName: 'Other Device',
      })
      const result = await svc.pushVault('sync-pw')

      expect(result).toEqual({
        success: false,
        error: 'Вейлт был обновлён на другом устройстве',
        conflict: {
          currentVersion: 5,
          updatedAt: 9999,
          deviceId: 'other-device-id',
          deviceName: 'Other Device',
        },
      })
      expect(svc.getSyncServerStatus().lastSeenVersion).toBe(0)
    })
  })

  describe('pullVault', () => {
    it('fails when not configured', async () => {
      const svc = await freshService()
      const result = await svc.pullVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('returns no-remote-vault on 404', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(404, { error: 'not found' })
      const result = await svc.pullVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'На сервере пока нет вейлта' })
    })

    it('overwrites the local db when the pulled blob differs', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      vi.mocked(readFileSync).mockReturnValue(Buffer.from('current-db'))
      vi.mocked(createDecipheriv).mockReturnValue(makeMockDecipher(Buffer.from('remote-db')) as any)
      mockFetchOnce(200, {
        blob: makeEnvelope(),
        version: 3,
        updatedAt: 555,
        deviceId: 'other',
        deviceName: 'Other',
      })

      const result = await svc.pullVault('sync-pw')

      expect(result).toEqual({ success: true, imported: true })
      expect(copyFileSync).toHaveBeenCalledWith('/mock/vault.db', '/mock/vault.db.bak')
      expect(writeFileSync).toHaveBeenCalledWith('/mock/vault.db', Buffer.from('remote-db'))
      expect(resetDatabase).toHaveBeenCalled()
      expect(svc.getSyncServerStatus().lastSeenVersion).toBe(3)
    })

    it('does not overwrite the local db when the pulled blob is identical', async () => {
      const svc = await freshService()
      await svc.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await svc.loginAccount('alice', 'pw', 'my-device')

      const sameBuffer = Buffer.from('same-db')
      vi.mocked(readFileSync).mockReturnValue(sameBuffer)
      vi.mocked(createDecipheriv).mockReturnValue(makeMockDecipher(sameBuffer) as any)
      mockFetchOnce(200, {
        blob: makeEnvelope(),
        version: 2,
        updatedAt: 111,
        deviceId: 'other',
        deviceName: 'Other',
      })

      const result = await svc.pullVault('sync-pw')

      expect(result).toEqual({ success: true, imported: false })
      expect(writeFileSync).not.toHaveBeenCalled()
      expect(resetDatabase).not.toHaveBeenCalled()
    })
  })

  describe('getSyncServerStatus', () => {
    it('reports the default unconfigured state', async () => {
      const svc = await freshService()
      expect(svc.getSyncServerStatus()).toEqual({
        configured: false,
        serverUrl: null,
        loggedIn: false,
        username: null,
        deviceId: null,
        deviceName: null,
        lastSeenVersion: 0,
        lastSyncTime: 0,
      })
    })
  })

  describe('loadSyncServerSettings', () => {
    it('restores persisted settings and session token', async () => {
      const svc = await freshService()
      vi.mocked(getDatabase).mockResolvedValue(makeMockDb({
        sync_server_url: 'http://saved:8787/',
        sync_server_username: 'bob',
        sync_server_device_id: 'device-xyz',
        sync_server_device_name: 'Bob PC',
        sync_server_last_seen_version: '7',
        sync_server_last_sync_time: '4242',
      }) as any)
      vi.mocked(getSecret).mockResolvedValueOnce('restored-token')

      await svc.loadSyncServerSettings()

      expect(svc.getSyncServerStatus()).toEqual({
        configured: true,
        serverUrl: 'http://saved:8787/',
        loggedIn: true,
        username: 'bob',
        deviceId: 'device-xyz',
        deviceName: 'Bob PC',
        lastSeenVersion: 7,
        lastSyncTime: 4242,
      })
    })
  })
})
