// Node.js crypto module for Electron
// Uses Node.js built-in crypto for performance

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash, timingSafeEqual as nodeTimingSafeEqual } from 'crypto'
import { CRYPTO, RATE_LIMIT, DEFAULTS } from './constants'

export interface EncryptedPayload {
  iv: string
  ciphertext: string
  authTag: string
}

export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(CRYPTO.IV_SIZE)
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: CRYPTO.AUTH_TAG_SIZE,
  })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return {
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    authTag: authTag.toString('hex'),
  }
}

export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const ivBuffer = Buffer.from(payload.iv, 'hex')
  const ciphertextBuffer = Buffer.from(payload.ciphertext, 'hex')
  const authTagBuffer = Buffer.from(payload.authTag, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer, {
    authTagLength: CRYPTO.AUTH_TAG_SIZE,
  })
  decipher.setAuthTag(authTagBuffer)

  const decrypted = Buffer.concat([
    decipher.update(ciphertextBuffer),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

export function encryptJSON(data: unknown, key: Buffer): EncryptedPayload {
  return encrypt(JSON.stringify(data), key)
}

export function decryptJSON<T = unknown>(payload: EncryptedPayload, key: Buffer): T {
  return JSON.parse(decrypt(payload, key)) as T
}

export function deriveKey(
  password: string,
  salt: Buffer,
  _type: 'argon2id' | 'pbkdf2' = 'pbkdf2'
): Buffer {
  return pbkdf2Sync(
    password,
    salt,
    CRYPTO.PBKDF2.ITERATIONS,
    CRYPTO.PBKDF2.KEY_LENGTH,
    'sha256'
  )
}

export function splitDerivedKey(derivedKey: Buffer): {
  encryptionKey: Buffer
  hmacKey: Buffer
} {
  return {
    encryptionKey: derivedKey.subarray(0, 32),
    hmacKey: derivedKey.subarray(32, 64),
  }
}

export function computeVerificationHash(encryptionKey: Buffer): string {
  return createHash('sha256')
    .update(Buffer.concat([encryptionKey, Buffer.from(CRYPTO.VERIFICATION_STRING)]))
    .digest('hex')
}

export function generateSalt(): Buffer {
  return randomBytes(CRYPTO.SALT_SIZE)
}

export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  return nodeTimingSafeEqual(a, b)
}

export function fromHex(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

export function toHex(bytes: Buffer): string {
  return bytes.toString('hex')
}

// Export constants
export { CRYPTO, RATE_LIMIT, DEFAULTS }
