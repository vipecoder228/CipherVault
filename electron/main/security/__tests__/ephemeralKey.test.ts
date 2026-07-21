import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'crypto'
import {
  generateSessionKey,
  getSessionKey,
  encryptEphemeral,
  decryptEphemeral,
  clearSessionKey,
  isSessionKeyValid,
} from '../ephemeralKey'

describe('EphemeralKey', () => {
  beforeEach(() => {
    clearSessionKey()
  })

  afterEach(() => {
    clearSessionKey()
  })

  describe('generateSessionKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateSessionKey()
      expect(key.length).toBe(32)
    })

    it('should generate different keys each time', () => {
      const key1 = generateSessionKey()
      const key2 = generateSessionKey()
      expect(key1.equals(key2)).toBe(false)
    })

    it('should accept custom TTL', () => {
      const key = generateSessionKey(60000)
      expect(key.length).toBe(32)
    })
  })

  describe('getSessionKey', () => {
    it('should return same key within TTL', () => {
      const key1 = getSessionKey()
      const key2 = getSessionKey()
      expect(key1.equals(key2)).toBe(true)
    })

    it('should generate new key if expired', async () => {
      const key1 = generateSessionKey(1) // 1ms TTL
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10))
      const key2 = getSessionKey()
      expect(key1.equals(key2)).toBe(false)
    })
  })

  describe('encryptEphemeral / decryptEphemeral', () => {
    it('should encrypt and decrypt with session key', () => {
      generateSessionKey()
      const plaintext = 'sensitive data'
      const encrypted = encryptEphemeral(plaintext)
      const decrypted = decryptEphemeral(encrypted.ciphertext, encrypted.iv, encrypted.authTag)
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt with custom key', () => {
      const key = randomBytes(32)
      const plaintext = 'test data'
      const encrypted = encryptEphemeral(plaintext, key)
      const decrypted = decryptEphemeral(encrypted.ciphertext, encrypted.iv, encrypted.authTag, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertexts for same plaintext', () => {
      generateSessionKey()
      const plaintext = 'same message'
      const enc1 = encryptEphemeral(plaintext)
      const enc2 = encryptEphemeral(plaintext)
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext)
    })

    it('should fail decryption with wrong key', () => {
      generateSessionKey()
      const encrypted = encryptEphemeral('data')
      const wrongKey = randomBytes(32)
      expect(() => decryptEphemeral(encrypted.ciphertext, encrypted.iv, encrypted.authTag, wrongKey)).toThrow()
    })

    it('should mark ephemeral=true when using session key', () => {
      generateSessionKey()
      const encrypted = encryptEphemeral('data')
      expect(encrypted.ephemeral).toBe(true)
    })

    it('should mark ephemeral=false when using custom key', () => {
      const key = randomBytes(32)
      const encrypted = encryptEphemeral('data', key)
      expect(encrypted.ephemeral).toBe(false)
    })
  })

  describe('clearSessionKey', () => {
    it('should clear the session key', () => {
      generateSessionKey()
      expect(isSessionKeyValid()).toBe(true)
      clearSessionKey()
      expect(isSessionKeyValid()).toBe(false)
    })
  })

  describe('isSessionKeyValid', () => {
    it('should return false when no key', () => {
      expect(isSessionKeyValid()).toBe(false)
    })

    it('should return true after generating key', () => {
      generateSessionKey()
      expect(isSessionKeyValid()).toBe(true)
    })
  })
})
