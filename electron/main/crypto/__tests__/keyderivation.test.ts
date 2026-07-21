import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { deriveKey, splitDerivedKey, computeVerificationHash, generateSalt } from '../keyderivation'

describe('Key Derivation', () => {
  describe('deriveKey', () => {
    it('should derive a key of correct length (32 bytes for Argon2id)', async () => {
      const password = 'test-password'
      const salt = randomBytes(32)
      const key = await deriveKey(password, salt)
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
    })

    it('should derive the same key for the same password and salt', async () => {
      const password = 'consistent-password'
      const salt = randomBytes(32)
      const key1 = await deriveKey(password, salt)
      const key2 = await deriveKey(password, salt)
      expect(key1.equals(key2)).toBe(true)
    })

    it('should derive different keys for different passwords', async () => {
      const salt = randomBytes(32)
      const key1 = await deriveKey('password1', salt)
      const key2 = await deriveKey('password2', salt)
      expect(key1.equals(key2)).toBe(false)
    })

    it('should derive different keys for different salts', async () => {
      const password = 'same-password'
      const key1 = await deriveKey(password, randomBytes(32))
      const key2 = await deriveKey(password, randomBytes(32))
      expect(key1.equals(key2)).toBe(false)
    })

    it('should handle empty password', async () => {
      const salt = randomBytes(32)
      const key = await deriveKey('', salt)
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
    })

    it('should handle long password', async () => {
      const password = 'a'.repeat(10000)
      const salt = randomBytes(32)
      const key = await deriveKey(password, salt)
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
    })
  })

  describe('splitDerivedKey', () => {
    it('should split key into encryption and HMAC keys', () => {
      const derivedKey = randomBytes(64)
      const { encryptionKey, hmacKey } = splitDerivedKey(derivedKey)
      expect(encryptionKey.length).toBe(32)
      expect(hmacKey.length).toBe(32)
    })

    it('should produce non-overlapping keys', () => {
      const derivedKey = randomBytes(64)
      const { encryptionKey, hmacKey } = splitDerivedKey(derivedKey)
      expect(encryptionKey.equals(hmacKey)).toBe(false)
    })

    it('should be deterministic', () => {
      const derivedKey = randomBytes(64)
      const split1 = splitDerivedKey(derivedKey)
      const split2 = splitDerivedKey(derivedKey)
      expect(split1.encryptionKey.equals(split2.encryptionKey)).toBe(true)
      expect(split1.hmacKey.equals(split2.hmacKey)).toBe(true)
    })
  })

  describe('computeVerificationHash', () => {
    it('should return a hex string', async () => {
      const encryptionKey = randomBytes(32)
      const hash = await computeVerificationHash(encryptionKey)
      expect(typeof hash).toBe('string')
      expect(/^[0-9a-f]{64}$/i.test(hash)).toBe(true)
    })

    it('should be deterministic', async () => {
      const encryptionKey = randomBytes(32)
      const hash1 = await computeVerificationHash(encryptionKey)
      const hash2 = await computeVerificationHash(encryptionKey)
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different keys', async () => {
      const hash1 = await computeVerificationHash(randomBytes(32))
      const hash2 = await computeVerificationHash(randomBytes(32))
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('generateSalt', () => {
    it('should return a buffer of correct size (32 bytes)', () => {
      const salt = generateSalt()
      expect(salt).toBeInstanceOf(Buffer)
      expect(salt.length).toBe(32)
    })

    it('should generate unique salts', () => {
      const salt1 = generateSalt()
      const salt2 = generateSalt()
      expect(salt1.equals(salt2)).toBe(false)
    })
  })
})
