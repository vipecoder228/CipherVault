// Web/mobile client for the self-hosted remote sync server. Mirrors
// electron/main/services/syncServer.service.ts's zero-knowledge crypto split
// and CVSB blob envelope, but uses Web Crypto (via shared/crypto/*) instead of
// Node's crypto module, and sql.js (webDb.ts) instead of the native sqlite file.
import {
  getWebDatabase,
  saveWebDatabase,
  replaceWebDatabase,
  getRawDb,
  webQueryOne,
  webRun,
  arrayToBase64,
  base64ToArray,
} from './webDb'
import { deriveKeyArgon2id32, generateSalt, toHex, fromHex } from '../../shared/crypto/keyderivation'
import { encrypt, decrypt } from '../../shared/crypto/encryption'
import { CRYPTO, SYNC } from '../../shared/crypto/constants'
import { ERRORS } from '../../shared/errors'
import { SYNC_API_ROUTES } from '../../shared/syncProtocol'
import type {
  LoginResponse,
  VaultBlobResponse,
  PushVaultResponse,
  VaultConflictResponse,
} from '../../shared/syncProtocol'
import type { SyncServerStatus, SyncServerPushResult } from '../../shared/types'
import { encryptWithKey, decryptWithKey, getDeviceKey } from './secureStorage'

// Same layout as electron/main/services/syncServer.service.ts and
// src/components/vault/panicBackup.ts: MAGIC(4) + salt(32) + iv(12) + ciphertext + authTag(16).
const BLOB_MAGIC = new TextEncoder().encode('CVSB')
const BLOB_HEADER_SIZE = BLOB_MAGIC.length + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE
const AUTH_LABEL_BYTES = new TextEncoder().encode(SYNC.AUTH_LABEL)

let serverUrl: string | null = null
let sessionToken: string | null = null
let username: string | null = null
let deviceId: string | null = null
let deviceName: string | null = null
let lastSeenVersion = 0
let lastSyncTime = 0
let settingsLoaded = false

// ─── Settings persistence (non-secret, sql.js `settings` table) ────────

async function loadStringSetting(key: string): Promise<string | null> {
  await getWebDatabase()
  const row = webQueryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : null
}

async function saveStringSetting(key: string, value: string | null): Promise<void> {
  await getWebDatabase()
  if (value === null) {
    webRun('DELETE FROM settings WHERE key = ?', [key])
  } else {
    webRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  }
  await saveWebDatabase()
}

const TOKEN_STORAGE_KEY = 'cv_secure_sync_server_token'

async function saveSessionToken(token: string | null): Promise<void> {
  if (token === null) {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    return
  }
  const deviceKey = await getDeviceKey()
  const encrypted = await encryptWithKey(token, deviceKey)
  localStorage.setItem(TOKEN_STORAGE_KEY, encrypted)
}

async function loadSessionToken(): Promise<string | null> {
  const encrypted = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (!encrypted) return null
  const deviceKey = await getDeviceKey()
  return decryptWithKey(encrypted, deviceKey)
}

export async function loadSyncServerSettings(): Promise<void> {
  serverUrl = await loadStringSetting('sync_server_url')
  username = await loadStringSetting('sync_server_username')
  deviceId = await loadStringSetting('sync_server_device_id')
  deviceName = await loadStringSetting('sync_server_device_name')
  const lastSeenVersionRaw = await loadStringSetting('sync_server_last_seen_version')
  lastSeenVersion = lastSeenVersionRaw ? Number(lastSeenVersionRaw) || 0 : 0
  const lastSyncTimeRaw = await loadStringSetting('sync_server_last_sync_time')
  lastSyncTime = lastSyncTimeRaw ? Number(lastSyncTimeRaw) || 0 : 0
  sessionToken = await loadSessionToken()
  settingsLoaded = true
}

// Electron restores this at app startup (loadSyncServerSettings() in
// electron/main/index.ts); the web/mobile backend has no equivalent startup
// hook (webHandlers is lazy-imported on first invoke), so every public entry
// point below ensures settings are loaded before touching module state.
async function ensureSettingsLoaded(): Promise<void> {
  if (!settingsLoaded) await loadSyncServerSettings()
}

// ─── Crypto: authSecret + vault blob envelope ──────────────────────────

async function deriveAuthSecret(syncPassword: string): Promise<string> {
  const bytes = await deriveKeyArgon2id32(syncPassword, AUTH_LABEL_BYTES)
  return toHex(bytes)
}

async function encryptVaultBuffer(dbBytes: Uint8Array, syncPassword: string): Promise<string> {
  const salt = generateSalt()
  const key = await deriveKeyArgon2id32(syncPassword, salt)
  const dbBase64 = arrayToBase64(dbBytes)
  const payload = await encrypt(dbBase64, key)

  const ivBytes = fromHex(payload.iv)
  const ciphertextBytes = fromHex(payload.ciphertext)
  const authTagBytes = fromHex(payload.authTag)

  const combined = new Uint8Array(
    BLOB_MAGIC.length + salt.length + ivBytes.length + ciphertextBytes.length + authTagBytes.length
  )
  let offset = 0
  combined.set(BLOB_MAGIC, offset); offset += BLOB_MAGIC.length
  combined.set(salt, offset); offset += salt.length
  combined.set(ivBytes, offset); offset += ivBytes.length
  combined.set(ciphertextBytes, offset); offset += ciphertextBytes.length
  combined.set(authTagBytes, offset)

  return arrayToBase64(combined)
}

async function decryptVaultBlob(blobBase64: string, syncPassword: string): Promise<Uint8Array> {
  const raw = base64ToArray(blobBase64)
  if (raw.length < BLOB_HEADER_SIZE + CRYPTO.AUTH_TAG_SIZE) throw new Error(ERRORS.BACKUP_FILE_TOO_SMALL)

  const magic = raw.slice(0, BLOB_MAGIC.length)
  if (!magic.every((b, i) => b === BLOB_MAGIC[i])) throw new Error(ERRORS.BACKUP_BAD_MAGIC)

  let offset = BLOB_MAGIC.length
  const salt = raw.slice(offset, offset += CRYPTO.SALT_SIZE)
  const iv = raw.slice(offset, offset += CRYPTO.IV_SIZE)
  const ciphertext = raw.slice(offset, raw.length - CRYPTO.AUTH_TAG_SIZE)
  const authTag = raw.slice(raw.length - CRYPTO.AUTH_TAG_SIZE)

  const key = await deriveKeyArgon2id32(syncPassword, salt)
  const dbBase64 = await decrypt({ iv: toHex(iv), ciphertext: toHex(ciphertext), authTag: toHex(authTag) }, key)
  return base64ToArray(dbBase64)
}

// ─── HTTP helper ────────────────────────────────────────────────────────

async function apiRequest(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  if (!serverUrl) throw new Error(ERRORS.SYNC_SERVER_NOT_CONFIGURED)

  let res: Response
  try {
    res = await fetch(new URL(path, serverUrl).toString(), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new Error(ERRORS.SYNC_SERVER_NETWORK_ERROR)
  }

  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ─── Public API ───────────────────────────────────────────────────────

export async function configureServer(url: string): Promise<void> {
  await ensureSettingsLoaded()
  let normalized: string
  try {
    normalized = new URL(url).toString()
  } catch {
    throw new Error(ERRORS.SYNC_SERVER_INVALID_URL)
  }
  serverUrl = normalized
  await saveStringSetting('sync_server_url', normalized)
}

export async function registerAccount(usernameInput: string, syncPassword: string): Promise<{ success: boolean; error?: string }> {
  await ensureSettingsLoaded()
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }

  const authSecret = await deriveAuthSecret(syncPassword)
  const { status, body } = await apiRequest(SYNC_API_ROUTES.register, {
    method: 'POST',
    body: JSON.stringify({ username: usernameInput, authSecret }),
  })

  if (status === 201) return { success: true }
  if (status === 409) return { success: false, error: ERRORS.SYNC_SERVER_USERNAME_TAKEN }
  return { success: false, error: body?.error || ERRORS.SYNC_SERVER_REGISTER_FAILED }
}

export async function loginAccount(
  usernameInput: string,
  syncPassword: string,
  deviceNameInput: string
): Promise<{ success: boolean; error?: string }> {
  await ensureSettingsLoaded()
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }

  if (!deviceId) {
    deviceId = crypto.randomUUID()
    await saveStringSetting('sync_server_device_id', deviceId)
  }

  const authSecret = await deriveAuthSecret(syncPassword)
  const { status, body } = await apiRequest(SYNC_API_ROUTES.login, {
    method: 'POST',
    body: JSON.stringify({ username: usernameInput, authSecret, deviceId, deviceName: deviceNameInput }),
  })

  if (status !== 200) {
    return { success: false, error: ERRORS.SYNC_SERVER_INVALID_CREDENTIALS }
  }

  const loginBody = body as LoginResponse
  sessionToken = loginBody.token
  username = usernameInput
  deviceName = deviceNameInput
  lastSeenVersion = 0

  await saveSessionToken(sessionToken)
  await saveStringSetting('sync_server_username', username)
  await saveStringSetting('sync_server_device_name', deviceName)
  await saveStringSetting('sync_server_last_seen_version', '0')

  return { success: true }
}

export async function logoutAccount(): Promise<void> {
  await ensureSettingsLoaded()
  if (sessionToken) {
    try {
      await apiRequest(SYNC_API_ROUTES.logout, { method: 'POST' })
    } catch {
      // Best-effort — still clear local session state even if the request fails.
    }
  }

  sessionToken = null
  username = null
  lastSeenVersion = 0
  lastSyncTime = 0

  await saveSessionToken(null)
  await saveStringSetting('sync_server_username', null)
  await saveStringSetting('sync_server_last_seen_version', null)
  await saveStringSetting('sync_server_last_sync_time', null)
}

// Deletes the account and its vault blob on the server (irreversible), then
// clears local session state the same way logoutAccount does.
export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
  await ensureSettingsLoaded()
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    const { status, body } = await apiRequest(SYNC_API_ROUTES.account, { method: 'DELETE' })
    if (status !== 204) {
      return { success: false, error: body?.error || ERRORS.SYNC_SERVER_DELETE_ACCOUNT_FAILED }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : ERRORS.SYNC_SERVER_DELETE_ACCOUNT_FAILED }
  }

  sessionToken = null
  username = null
  lastSeenVersion = 0
  lastSyncTime = 0

  await saveSessionToken(null)
  await saveStringSetting('sync_server_username', null)
  await saveStringSetting('sync_server_last_seen_version', null)
  await saveStringSetting('sync_server_last_sync_time', null)

  return { success: true }
}

// `forceVersion` lets the UI retry a push after a 409 conflict, overwriting the
// remote blob by re-submitting with the server's reported currentVersion as
// expectedVersion instead of our stale lastSeenVersion.
export async function pushVault(syncPassword: string, forceVersion?: number): Promise<SyncServerPushResult> {
  await ensureSettingsLoaded()
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    await getWebDatabase()
    const dbBytes = new Uint8Array(getRawDb().export())
    const blob = await encryptVaultBuffer(dbBytes, syncPassword)

    const { status, body } = await apiRequest(SYNC_API_ROUTES.vault, {
      method: 'PUT',
      body: JSON.stringify({ blob, expectedVersion: forceVersion ?? lastSeenVersion }),
    })

    if (status === 409) {
      const conflict = body as VaultConflictResponse
      return {
        success: false,
        error: ERRORS.SYNC_SERVER_CONFLICT,
        conflict: {
          currentVersion: conflict.currentVersion,
          updatedAt: conflict.updatedAt,
          deviceId: conflict.deviceId,
          deviceName: conflict.deviceName,
        },
      }
    }
    if (status !== 200) {
      return { success: false, error: body?.error || ERRORS.SYNC_SERVER_PUSH_FAILED }
    }

    const pushBody = body as PushVaultResponse
    lastSeenVersion = pushBody.version
    lastSyncTime = pushBody.updatedAt
    await saveStringSetting('sync_server_last_seen_version', String(lastSeenVersion))
    await saveStringSetting('sync_server_last_sync_time', String(lastSyncTime))

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : ERRORS.SYNC_SERVER_PUSH_FAILED }
  }
}

export async function pullVault(syncPassword: string): Promise<{ success: boolean; error?: string; imported?: boolean }> {
  await ensureSettingsLoaded()
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    const { status, body } = await apiRequest(SYNC_API_ROUTES.vault, { method: 'GET' })

    if (status === 404) return { success: false, error: ERRORS.SYNC_SERVER_NO_REMOTE_VAULT }
    if (status !== 200) return { success: false, error: body?.error || ERRORS.SYNC_SERVER_PULL_FAILED }

    const remote = body as VaultBlobResponse
    const decrypted = await decryptVaultBlob(remote.blob, syncPassword)

    await getWebDatabase()
    const currentBytes = new Uint8Array(getRawDb().export())
    const imported = decrypted.length !== currentBytes.length || !decrypted.every((b, i) => b === currentBytes[i])

    if (imported) {
      await replaceWebDatabase(decrypted)
    }

    lastSeenVersion = remote.version
    lastSyncTime = Date.now()
    await saveStringSetting('sync_server_last_seen_version', String(lastSeenVersion))
    await saveStringSetting('sync_server_last_sync_time', String(lastSyncTime))

    return { success: true, imported }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : ERRORS.SYNC_SERVER_PULL_FAILED }
  }
}

export async function getSyncServerStatus(): Promise<SyncServerStatus> {
  await ensureSettingsLoaded()
  return {
    configured: serverUrl !== null,
    serverUrl,
    loggedIn: sessionToken !== null,
    username,
    deviceId,
    deviceName,
    lastSeenVersion,
    lastSyncTime,
  }
}
