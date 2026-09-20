// ─── Electron Crypto Adapter ─────────────────────────────
// Wraps Node.js crypto for use with the shared vault logic

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash, timingSafeEqual } from 'crypto'
import { authenticator } from 'otplib'
import type { CryptoAdapter, EncryptedPayload } from '../../../shared/vault/vaultAdapter'

const CRYPTO = {
  IV_SIZE: 12,
  AUTH_TAG_SIZE: 16,
  SALT_SIZE: 32,
  PBKDF2: { ITERATIONS: 600000, KEY_LENGTH: 64 },
}

export const electronCryptoAdapter: CryptoAdapter = {
  async deriveKey(password: string, salt: Uint8Array, type: 'argon2id' | 'pbkdf2' = 'argon2id') {
    if (type === 'argon2id') {
      const { deriveKey: argon2Derive } = await import('./keyderivation')
      const buf = await argon2Derive(password, Buffer.from(salt))
      return new Uint8Array(buf)
    }
    const derived = pbkdf2Sync(password, Buffer.from(salt), CRYPTO.PBKDF2.ITERATIONS, CRYPTO.PBKDF2.KEY_LENGTH, 'sha256')
    return new Uint8Array(derived)
  },

  splitDerivedKey(key: Uint8Array) {
    return {
      encryptionKey: key.subarray(0, 32),
      hmacKey: key.subarray(32, 64),
    }
  },

  async computeVerificationHash(encryptionKey: Uint8Array) {
    const { CRYPTO: constCrypto } = await import('../../../shared/crypto/constants')
    return createHash('sha256')
      .update(Buffer.concat([Buffer.from(encryptionKey), Buffer.from(constCrypto.VERIFICATION_STRING)]))
      .digest('hex')
  },

  generateSalt() {
    return new Uint8Array(randomBytes(CRYPTO.SALT_SIZE))
  },

  async encrypt(plaintext: string, key: Uint8Array) {
    const iv = randomBytes(CRYPTO.IV_SIZE)
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv, {
      authTagLength: CRYPTO.AUTH_TAG_SIZE,
    })
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return {
      iv: iv.toString('hex'),
      ciphertext: encrypted.toString('hex'),
      authTag: authTag.toString('hex'),
    }
  },

  async decrypt(payload: EncryptedPayload, key: Uint8Array) {
    const ivBuffer = Buffer.from(payload.iv, 'hex')
    const ciphertextBuffer = Buffer.from(payload.ciphertext, 'hex')
    const authTagBuffer = Buffer.from(payload.authTag, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), ivBuffer, {
      authTagLength: CRYPTO.AUTH_TAG_SIZE,
    })
    decipher.setAuthTag(authTagBuffer)
    return Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]).toString('utf8')
  },

  async encryptJSON(data: unknown, key: Uint8Array) {
    return electronCryptoAdapter.encrypt(JSON.stringify(data), key)
  },

  async decryptJSON<T = unknown>(payload: EncryptedPayload, key: Uint8Array): Promise<T> {
    return JSON.parse(await electronCryptoAdapter.decrypt(payload, key)) as T
  },

  timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  },

  generateTOTPSecret(): string {
    return authenticator.generateSecret(20)
  },

  async verifyTOTP(secret: string, token: string): Promise<boolean> {
    return authenticator.check(token, secret)
  },

  async generateTOTPCode(secret: string): Promise<string> {
    return authenticator.generate(secret)
  },

  generateQRCodeUrl(secret: string, username: string = 'CipherVault'): string {
    return authenticator.keyuri(username, 'CipherVault', secret)
  },
}
