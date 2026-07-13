import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { CRYPTO } from './constants'

export interface EncryptedPayload {
  iv: string
  ciphertext: string
  authTag: string
}

export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(CRYPTO.IV_SIZE)
  const cipher = createCipheriv(CRYPTO.ENCRYPTION_ALGO, key, iv, {
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

  const decipher = createDecipheriv(CRYPTO.ENCRYPTION_ALGO, key, ivBuffer, {
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
