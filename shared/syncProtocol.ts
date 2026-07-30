// Single source of truth for the remote sync server's REST contract, imported
// by both the server (server/src/routes/*) and every client (Electron main,
// webBackend). The server never sees plaintext vault data — `blob` is always
// the opaque envelope produced by the client (MAGIC+salt+iv+ciphertext+authTag,
// see src/components/vault/panicBackup.ts for the same envelope shape).

export interface RegisterRequest {
  username: string
  authSecret: string // hex-encoded, derived from the sync password client-side — see shared/crypto/constants.ts SYNC.AUTH_LABEL
}

export interface RegisterResponse {
  success: true
}

export interface LoginRequest {
  username: string
  authSecret: string
  deviceId: string
  deviceName: string
}

export interface LoginResponse {
  token: string
  expiresAt: number // epoch ms
}

export interface VaultBlobResponse {
  blob: string // base64 envelope
  version: number
  updatedAt: number
  deviceId: string
  deviceName: string
}

export interface PushVaultRequest {
  blob: string
  expectedVersion: number // 0 for first push
}

export interface PushVaultResponse {
  version: number
  updatedAt: number
}

// Returned as the body of a 409 response to PUT /api/vault
export interface VaultConflictResponse {
  error: 'conflict'
  currentVersion: number
  updatedAt: number
  deviceId: string
  deviceName: string
}

export interface ApiErrorResponse {
  error: string
}

export const SYNC_API_ROUTES = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  vault: '/api/vault',
  account: '/api/auth/account',
} as const
