import { describe, it, expect, beforeEach, vi } from 'vitest'

// sql.js's WASM loader has no .wasm file available under vitest/Node — skip
// straight to the (real, working) asm.js path, same as webBackend.kdf.test.ts.
vi.mock('sql.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sql.js')>()
  return { ...actual, default: () => Promise.reject(new Error('wasm disabled in tests')) }
})

function mockFetchOnce(status: number, body: any) {
  vi.mocked(fetch).mockResolvedValueOnce({
    status,
    json: () => Promise.resolve(body),
  } as any)
}

// Builds a well-formed CVSB envelope (magic + salt(32) + iv(12) + ciphertext + authTag(16))
// with real content so a real decrypt() call against a real encrypt() output succeeds.
async function makeEnvelope(dbBytes: Uint8Array, syncPassword: string) {
  const { deriveKeyArgon2id32, generateSalt, fromHex, toHex } = await import('../../../shared/crypto/keyderivation')
  const { encrypt } = await import('../../../shared/crypto/encryption')
  const { arrayToBase64 } = await import('../webDb')

  const salt = generateSalt()
  const key = await deriveKeyArgon2id32(syncPassword, salt)
  const payload = await encrypt(arrayToBase64(dbBytes), key)

  const magic = new TextEncoder().encode('CVSB')
  const ivBytes = fromHex(payload.iv)
  const ciphertextBytes = fromHex(payload.ciphertext)
  const authTagBytes = fromHex(payload.authTag)
  const combined = new Uint8Array(magic.length + salt.length + ivBytes.length + ciphertextBytes.length + authTagBytes.length)
  let offset = 0
  combined.set(magic, offset); offset += magic.length
  combined.set(salt, offset); offset += salt.length
  combined.set(ivBytes, offset); offset += ivBytes.length
  combined.set(ciphertextBytes, offset); offset += ciphertextBytes.length
  combined.set(authTagBytes, offset)
  return arrayToBase64(combined)
}

// Each test gets a fresh module graph so webDb's module-level `db` singleton
// and this module's own session state don't leak between tests.
async function freshClient() {
  vi.resetModules()
  return import('../syncServerClient')
}

describe('syncServerClient', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('configureServer', () => {
    it('normalizes and persists a valid URL', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')

      const status = await client.getSyncServerStatus()
      expect(status.configured).toBe(true)
      expect(status.serverUrl).toBe('http://localhost:8787/')
    })

    it('rejects an invalid URL', async () => {
      const client = await freshClient()
      await expect(client.configureServer('not-a-url')).rejects.toThrow('Неверный адрес сервера')
    })
  })

  describe('registerAccount', () => {
    it('fails when server is not configured', async () => {
      const client = await freshClient()
      const result = await client.registerAccount('alice', 'pw')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('succeeds on 201', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(201, { success: true })

      const result = await client.registerAccount('alice', 'pw')
      expect(result).toEqual({ success: true })
    })

    it('reports username taken on 409', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(409, { error: 'conflict' })

      const result = await client.registerAccount('alice', 'pw')
      expect(result).toEqual({ success: false, error: 'Это имя пользователя уже занято' })
    })
  })

  describe('loginAccount', () => {
    it('fails when server is not configured', async () => {
      const client = await freshClient()
      const result = await client.loginAccount('alice', 'pw', 'my-device')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('stores an encrypted session token and settings on success', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })

      const result = await client.loginAccount('alice', 'pw', 'my-device')
      expect(result).toEqual({ success: true })

      // Token must not be stored in plaintext localStorage.
      const raw = store['cv_secure_sync_server_token']
      expect(raw).toBeTruthy()
      expect(raw).not.toContain('tok-123')

      const status = await client.getSyncServerStatus()
      expect(status.loggedIn).toBe(true)
      expect(status.username).toBe('alice')
      expect(status.deviceName).toBe('my-device')
      expect(status.deviceId).toBeTruthy()
    })

    it('reports invalid credentials on non-200', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(401, { error: 'invalid' })

      const result = await client.loginAccount('alice', 'wrong-pw', 'my-device')
      expect(result).toEqual({ success: false, error: 'Неверное имя пользователя или пароль' })
    })
  })

  describe('logoutAccount', () => {
    it('clears local session state even if the network request fails', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
      await client.logoutAccount()

      expect(store['cv_secure_sync_server_token']).toBeUndefined()
      const status = await client.getSyncServerStatus()
      expect(status.loggedIn).toBe(false)
      expect(status.username).toBeNull()
    })
  })

  describe('deleteAccount', () => {
    it('fails when not configured', async () => {
      const client = await freshClient()
      const result = await client.deleteAccount()
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('fails when not logged in', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      const result = await client.deleteAccount()
      expect(result).toEqual({ success: false, error: 'Вы не авторизованы на сервере синхронизации' })
    })

    it('clears local session state on 204', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(204, undefined)
      const result = await client.deleteAccount()

      expect(result).toEqual({ success: true })
      expect(store['cv_secure_sync_server_token']).toBeUndefined()
      const status = await client.getSyncServerStatus()
      expect(status.loggedIn).toBe(false)
      expect(status.username).toBeNull()
    })

    it('keeps local session state when the server request fails', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
      const result = await client.deleteAccount()

      expect(result.success).toBe(false)
      expect(store['cv_secure_sync_server_token']).toBeTruthy()
      expect((await client.getSyncServerStatus()).loggedIn).toBe(true)
    })
  })

  describe('pushVault / pullVault', () => {
    it('push fails when not configured', async () => {
      const client = await freshClient()
      const result = await client.pushVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('push fails when not logged in', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      const result = await client.pushVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'Вы не авторизованы на сервере синхронизации' })
    })

    it('push updates the local version on success', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(200, { version: 1, updatedAt: 1234 })
      const result = await client.pushVault('sync-pw')

      expect(result).toEqual({ success: true })
      const status = await client.getSyncServerStatus()
      expect(status.lastSeenVersion).toBe(1)
      expect(status.lastSyncTime).toBe(1234)
    }, 15000)

    it('push returns conflict details on 409 without advancing local version', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(409, {
        error: 'conflict',
        currentVersion: 5,
        updatedAt: 9999,
        deviceId: 'other-device-id',
        deviceName: 'Other Device',
      })
      const result = await client.pushVault('sync-pw')

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
      expect((await client.getSyncServerStatus()).lastSeenVersion).toBe(0)
    }, 15000)

    it('pull fails when not configured', async () => {
      const client = await freshClient()
      const result = await client.pullVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'Сервер синхронизации не настроен' })
    })

    it('pull returns no-remote-vault on 404', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      mockFetchOnce(404, { error: 'not found' })
      const result = await client.pullVault('sync-pw')
      expect(result).toEqual({ success: false, error: 'На сервере пока нет вейлта' })
    })

    it('pull decrypts and replaces the local database when the blob differs', async () => {
      const client = await freshClient()
      const db = await import('../webDb')
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-123', expiresAt: Date.now() + 1000 })
      await client.loginAccount('alice', 'pw', 'my-device')

      // A different, well-formed sqlite file with the app's real schema (as a
      // genuinely pushed vault would have), built via a separate module
      // instance/localStorage store so it doesn't touch this test's own db.
      const otherStore: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => (k in otherStore ? otherStore[k] : null),
        setItem: (k: string, v: string) => { otherStore[k] = v },
        removeItem: (k: string) => { delete otherStore[k] },
      })
      vi.resetModules()
      const remoteDbModule = await import('../webDb')
      await remoteDbModule.getWebDatabase()
      remoteDbModule.webRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['remote_marker', '1'])
      await remoteDbModule.saveWebDatabase()
      const remoteDb = new Uint8Array(remoteDbModule.getRawDb().export())

      // Restore this test's own localStorage store so subsequent calls on the
      // original `client`/`db` module instances (captured before resetModules)
      // read/write the right backing store again.
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = v },
        removeItem: (k: string) => { delete store[k] },
      })

      const blob = await makeEnvelope(remoteDb, 'sync-pw')
      mockFetchOnce(200, { blob, version: 3, updatedAt: 555, deviceId: 'other', deviceName: 'Other' })

      const result = await client.pullVault('sync-pw')

      expect(result).toEqual({ success: true, imported: true })
      expect((await client.getSyncServerStatus()).lastSeenVersion).toBe(3)

      // pullVault writes its own settings (last-seen version/time) into the
      // newly-imported db right after replaceWebDatabase, so the local db is
      // no longer byte-identical to remoteDb — check the imported marker row
      // instead of a full byte comparison.
      const marker = db.webQueryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['remote_marker'])
      expect(marker?.value).toBe('1')
    }, 15000)
  })

  describe('loadSyncServerSettings', () => {
    it('restores persisted settings and decrypts the stored session token', async () => {
      const client = await freshClient()
      await client.configureServer('http://localhost:8787')
      mockFetchOnce(200, { token: 'tok-abc', expiresAt: Date.now() + 1000 })
      await client.loginAccount('bob', 'pw', 'Bob PC')

      // Simulate a fresh page load: new module graph, but the same
      // localStorage-backed sql.js persistence (webDb falls back to
      // localStorage for both the settings table and the encrypted token).
      vi.resetModules()
      const reloaded = await import('../syncServerClient')
      await reloaded.loadSyncServerSettings()

      const status = await reloaded.getSyncServerStatus()
      expect(status.configured).toBe(true)
      expect(status.serverUrl).toBe('http://localhost:8787/')
      expect(status.loggedIn).toBe(true)
      expect(status.username).toBe('bob')
      expect(status.deviceName).toBe('Bob PC')
    }, 15000)
  })
})
