// ─── Ephemeral Key System ───────────────────────────────
// Provides forward secrecy by using session-specific keys

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { CRYPTO } from '../crypto/constants'

interface EphemeralKeyPair {
  publicKey: Buffer
  privateKey: Buffer
  expiresAt: number
}

let currentSessionKey: Buffer | null = null
let sessionKeyExpiry: number = 0

/**
 * Generate a new ephemeral session key
 */
export function generateSessionKey(ttlMs: number = 3600000): Buffer {
  currentSessionKey = randomBytes(32)
  sessionKeyExpiry = Date.now() + ttlMs
  return currentSessionKey
}

/**
 * Get current session key (generates new one if expired)
 */
export function getSessionKey(): Buffer {
  if (!currentSessionKey || Date.now() > sessionKeyExpiry) {
    generateSessionKey()
  }
  return currentSessionKey!
}

/**
 * Encrypt data with ephemeral key (for temporary storage)
 */
export function encryptEphemeral(plaintext: string, key?: Buffer): {
  ciphertext: string
  iv: string
  authTag: string
  ephemeral: boolean
} {
  const encKey = key || getSessionKey()
  const iv = randomBytes(CRYPTO.IV_SIZE)

  const cipher = createCipheriv(CRYPTO.ENCRYPTION_ALGO, encKey, iv, {
    authTagLength: CRYPTO.AUTH_TAG_SIZE,
  })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    ephemeral: !key,
  }
}

/**
 * Decrypt data with ephemeral key
 */
export function decryptEphemeral(
  ciphertext: string,
  iv: string,
  authTag: string,
  key?: Buffer
): string {
  const encKey = key || getSessionKey()

  const decipher = createDecipheriv(
    CRYPTO.ENCRYPTION_ALGO,
    encKey,
    Buffer.from(iv, 'hex'),
    { authTagLength: CRYPTO.AUTH_TAG_SIZE }
  )
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Clear session key (for logout/lock)
 */
export function clearSessionKey(): void {
  if (currentSessionKey) {
    currentSessionKey.fill(0)
    currentSessionKey = null
  }
  sessionKeyExpiry = 0
}

/**
 * Check if session key is valid
 */
export function isSessionKeyValid(): boolean {
  return currentSessionKey !== null && Date.now() <= sessionKeyExpiry
}
