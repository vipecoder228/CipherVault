import { randomBytes as nodeRandomBytes, randomUUID, createCipheriv, createDecipheriv } from 'crypto'
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { getDatabasePath, saveDatabase, getDatabase, resetDatabase } from '../db/connection'
import { deriveKeyArgon2id32, generateSalt, toHex } from '../../../shared/crypto/keyderivation'
import { SYNC } from '../../../shared/crypto/constants'
import { CRYPTO } from '../crypto/constants'
import { ERRORS } from '../../../shared/errors'
import { SYNC_API_ROUTES } from '../../../shared/syncProtocol'
import type {
  LoginResponse,
  VaultBlobResponse,
  PushVaultResponse,
  VaultConflictResponse,
  ListSessionsResponse,
  SessionInfo,
} from '../../../shared/syncProtocol'
import type { SyncServerStatus, SyncServerPushResult } from '../../../shared/types'
import { saveSecret, getSecret, clearSecret } from './secretStorage'

// Blob envelope for the whole encrypted vault DB file pushed/pulled from the
// sync server — same layout as src/components/vault/panicBackup.ts's envelope
// (MAGIC + salt + iv + ciphertext + authTag), distinct magic since the payload
// here is the raw sqlite file, not a JSON backup. Layout must match exactly
// since the web/mobile client pushes/pulls the same blob format.
const BLOB_MAGIC = Buffer.from('CVSB', 'ascii')
const BLOB_HEADER_SIZE = BLOB_MAGIC.length + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE + CRYPTO.AUTH_TAG_SIZE
const AUTH_LABEL_BYTES = new TextEncoder().encode(SYNC.AUTH_LABEL)

let serverUrl: string | null = null
let sessionToken: string | null = null
let username: string | null = null
let deviceId: string | null = null
let deviceName: string | null = null
let lastSeenVersion = 0
let lastSyncTime = 0

// ─── Settings persistence (non-secret) ─────────────────

async function loadStringSetting(key: string): Promise<string | null> {
  const db = await getDatabase()
  const result = db.exec('SELECT value FROM settings WHERE key = ?', [key])
  if (result.length === 0 || result[0].values.length === 0) return null
  return result[0].values[0][0] as string
}

async function saveStringSetting(key: string, value: string | null): Promise<void> {
  const db = await getDatabase()
  if (value === null) {
    db.run('DELETE FROM settings WHERE key = ?', [key])
  } else {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  }
  saveDatabase()
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
  sessionToken = await getSecret('sync_server_token')
}

// ─── Crypto: authSecret + vault blob envelope ──────────

async function deriveAuthSecret(syncPassword: string): Promise<string> {
  const bytes = await deriveKeyArgon2id32(syncPassword, AUTH_LABEL_BYTES)
  return toHex(bytes)
}

async function encryptVaultBuffer(dbBuffer: Buffer, syncPassword: string): Promise<string> {
  const salt = Buffer.from(generateSalt())
  const key = Buffer.from(await deriveKeyArgon2id32(syncPassword, salt))
  const iv = nodeRandomBytes(CRYPTO.IV_SIZE)

  const cipher = createCipheriv(CRYPTO.ENCRYPTION_ALGO, key, iv, { authTagLength: CRYPTO.AUTH_TAG_SIZE })
  const encrypted = Buffer.concat([cipher.update(dbBuffer), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([BLOB_MAGIC, salt, iv, encrypted, authTag]).toString('base64')
}

async function decryptVaultBlob(blobBase64: string, syncPassword: string): Promise<Buffer> {
  const raw = Buffer.from(blobBase64, 'base64')
  if (raw.length < BLOB_HEADER_SIZE) throw new Error(ERRORS.BACKUP_FILE_TOO_SMALL)
  if (!raw.subarray(0, BLOB_MAGIC.length).equals(BLOB_MAGIC)) throw new Error(ERRORS.BACKUP_BAD_MAGIC)

  let offset = BLOB_MAGIC.length
  const salt = raw.subarray(offset, offset += CRYPTO.SALT_SIZE)
  const iv = raw.subarray(offset, offset += CRYPTO.IV_SIZE)
  const ciphertext = raw.subarray(offset, raw.length - CRYPTO.AUTH_TAG_SIZE)
  const authTag = raw.subarray(raw.length - CRYPTO.AUTH_TAG_SIZE)

  const key = Buffer.from(await deriveKeyArgon2id32(syncPassword, salt))
  const decipher = createDecipheriv(CRYPTO.ENCRYPTION_ALGO, key, iv, { authTagLength: CRYPTO.AUTH_TAG_SIZE })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ─── HTTP helper ────────────────────────────────────────

async function apiRequest(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  if (!serverUrl) throw new Error(ERRORS.SYNC_SERVER_NOT_CONFIGURED)

  let res: Response
  try {
    res = await fetch(new URL(path, serverUrl), {
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

// ─── Public API ─────────────────────────────────────────

export async function configureServer(url: string): Promise<void> {
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
): Promise<{ success: boolean; error?: string; otherSessions?: SessionInfo[] }> {
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }

  if (!deviceId) {
    deviceId = randomUUID()
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

  await saveSecret('sync_server_token', sessionToken)
  await saveStringSetting('sync_server_username', username)
  await saveStringSetting('sync_server_device_name', deviceName)
  await saveStringSetting('sync_server_last_seen_version', '0')

  return { success: true, otherSessions: loginBody.otherSessions }
}

export async function logoutAccount(): Promise<void> {
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

  await clearSecret('sync_server_token')
  await saveStringSetting('sync_server_username', null)
  await saveStringSetting('sync_server_last_seen_version', null)
  await saveStringSetting('sync_server_last_sync_time', null)
}

// Deletes the account and its vault blob on the server (irreversible), then
// clears local session state the same way logoutAccount does.
export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
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

  await clearSecret('sync_server_token')
  await saveStringSetting('sync_server_username', null)
  await saveStringSetting('sync_server_last_seen_version', null)
  await saveStringSetting('sync_server_last_sync_time', null)

  return { success: true }
}

// `forceVersion` lets the UI retry a push after a 409 conflict, overwriting the
// remote blob by re-submitting with the server's reported currentVersion as
// expectedVersion instead of our stale lastSeenVersion.
export async function pushVault(syncPassword: string, forceVersion?: number): Promise<SyncServerPushResult> {
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    saveDatabase()
    const dbBuffer = readFileSync(getDatabasePath())
    const blob = await encryptVaultBuffer(dbBuffer, syncPassword)

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
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    const { status, body } = await apiRequest(SYNC_API_ROUTES.vault, { method: 'GET' })

    if (status === 404) return { success: false, error: ERRORS.SYNC_SERVER_NO_REMOTE_VAULT }
    if (status !== 200) return { success: false, error: body?.error || ERRORS.SYNC_SERVER_PULL_FAILED }

    const remote = body as VaultBlobResponse
    const decrypted = await decryptVaultBlob(remote.blob, syncPassword)

    const dbPath = getDatabasePath()
    const currentBuffer = readFileSync(dbPath)
    const imported = !decrypted.equals(currentBuffer)

    if (imported) {
      copyFileSync(dbPath, dbPath + '.bak')
      writeFileSync(dbPath, decrypted)
      resetDatabase()
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

export async function listSessions(): Promise<{ success: boolean; error?: string; sessions?: SessionInfo[] }> {
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    const { status, body } = await apiRequest(SYNC_API_ROUTES.sessions, { method: 'GET' })
    if (status !== 200) {
      return { success: false, error: body?.error || ERRORS.SYNC_SERVER_LIST_SESSIONS_FAILED }
    }
    const listBody = body as ListSessionsResponse
    return { success: true, sessions: listBody.sessions }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : ERRORS.SYNC_SERVER_LIST_SESSIONS_FAILED }
  }
}

export async function revokeSession(deviceId: string): Promise<{ success: boolean; error?: string }> {
  if (!serverUrl) return { success: false, error: ERRORS.SYNC_SERVER_NOT_CONFIGURED }
  if (!sessionToken) return { success: false, error: ERRORS.SYNC_SERVER_NOT_LOGGED_IN }

  try {
    const { status, body } = await apiRequest(`${SYNC_API_ROUTES.sessions}/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
    if (status !== 204) {
      return { success: false, error: body?.error || ERRORS.SYNC_SERVER_REVOKE_SESSION_FAILED }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : ERRORS.SYNC_SERVER_REVOKE_SESSION_FAILED }
  }
}

export function getSyncServerStatus(): SyncServerStatus {
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
