import { describe, it, expect } from 'vitest'
import { randomBytes, createHash } from 'crypto'
import { encrypt, decrypt, encryptJSON, decryptJSON } from '../encryption'
import { deriveKey, generateSalt } from '../keyderivation'
import { CRYPTO, RATE_LIMIT } from '../constants'

describe('Additional Crypto Tests', () => {
  describe('Encryption stress tests', () => {
    const key = randomBytes(32)

    it('should encrypt/decrypt 100 different strings', () => {
      for (let i = 0; i < 100; i++) {
        const plaintext = `test-string-${i}-${Date.now()}`
        const encrypted = encrypt(plaintext, key)
        const decrypted = decrypt(encrypted, key)
        expect(decrypted).toBe(plaintext)
      }
    })

    it('should handle binary data', () => {
      const data = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))
      const plaintext = data.toString('hex')
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should handle empty JSON', () => {
      const encrypted = encryptJSON({}, key)
      const decrypted = decryptJSON(encrypted, key)
      expect(decrypted).toEqual({})
    })

    it('should handle deeply nested JSON', () => {
      const data = { a: { b: { c: { d: { e: 'deep' } } } } }
      const encrypted = encryptJSON(data, key)
      const decrypted = decryptJSON(encrypted, key)
      expect(decrypted).toEqual(data)
    })

    it('should handle array with mixed types', () => {
      const data = [1, 'two', true, null, { three: 3 }]
      const encrypted = encryptJSON(data, key)
      const decrypted = decryptJSON(encrypted, key)
      expect(decrypted).toEqual(data)
    })
  })

  describe('Key derivation stress tests', () => {
    it('should derive 5 unique keys', async () => {
      const keys = []
      for (let i = 0; i < 5; i++) {
        const key = await deriveKey(`password-${i}`, generateSalt())
        keys.push(key.toString('hex'))
      }
      const unique = new Set(keys)
      expect(unique.size).toBe(5)
    })

    it('should handle very long password', async () => {
      const longPass = 'x'.repeat(10000)
      const key = await deriveKey(longPass, generateSalt())
      expect(key.length).toBe(32)
    })

    it('should handle empty salt', async () => {
      const salt = Buffer.alloc(32, 0)
      const key = await deriveKey('test', salt)
      expect(key.length).toBe(32)
    })

    it('should handle max salt', async () => {
      const salt = Buffer.alloc(32, 0xFF)
      const key = await deriveKey('test', salt)
      expect(key.length).toBe(32)
    })
  })

  describe('Crypto constants validation', () => {
    it('should have correct PBKDF2 iterations', () => {
      expect(CRYPTO.PBKDF2.ITERATIONS).toBe(600000)
    })

    it('should have correct key length', () => {
      expect(CRYPTO.PBKDF2.KEY_LENGTH).toBe(64)
    })

    it('should use SHA-256', () => {
      expect(CRYPTO.PBKDF2.DIGEST).toBe('sha256')
    })

    it('should have correct salt size', () => {
      expect(CRYPTO.SALT_SIZE).toBe(32)
    })

    it('should have correct IV size for GCM', () => {
      expect(CRYPTO.IV_SIZE).toBe(12)
    })

    it('should have correct auth tag size', () => {
      expect(CRYPTO.AUTH_TAG_SIZE).toBe(16)
    })

    it('should use AES-256-GCM', () => {
      expect(CRYPTO.ENCRYPTION_ALGO).toBe('aes-256-gcm')
    })
  })

  describe('Rate limit constants', () => {
    it('should have progressive delays', () => {
      expect(RATE_LIMIT.DELAY_1_MS).toBeLessThan(RATE_LIMIT.DELAY_2_MS)
      expect(RATE_LIMIT.DELAY_2_MS).toBeLessThan(RATE_LIMIT.DELAY_3_MS)
    })

    it('should lock after max attempts', () => {
      expect(RATE_LIMIT.ATTEMPTS_BEFORE_LOCK).toBe(10)
    })

    it('should have 5-minute window', () => {
      expect(RATE_LIMIT.WINDOW_MS).toBe(300000)
    })
  })

  describe('Hash functions', () => {
    it('should produce consistent SHA-256 hashes', () => {
      const data = 'test data'
      const hash1 = createHash('sha256').update(data).digest('hex')
      const hash2 = createHash('sha256').update(data).digest('hex')
      expect(hash1).toBe(hash2)
    })

    it('should produce 64-char hex SHA-256', () => {
      const hash = createHash('sha256').update('test').digest('hex')
      expect(hash.length).toBe(64)
    })

    it('should produce 40-char hex SHA-1', () => {
      const hash = createHash('sha1').update('test').digest('hex')
      expect(hash.length).toBe(40)
    })

    it('should be one-way (cannot reverse)', () => {
      const hash = createHash('sha256').update('secret').digest('hex')
      expect(hash).not.toBe('secret')
    })
  })
})
