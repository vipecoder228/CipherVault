import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { encrypt, decrypt, encryptJSON, decryptJSON } from '../encryption'

describe('Encryption', () => {
  const key = randomBytes(32)

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const plaintext = 'Same message'
      const encrypted1 = encrypt(plaintext, key)
      const encrypted2 = encrypt(plaintext, key)
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
    })

    it('should handle empty strings', () => {
      const plaintext = ''
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000)
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should throw on wrong key', () => {
      const plaintext = 'Secret data'
      const encrypted = encrypt(plaintext, key)
      const wrongKey = randomBytes(32)
      expect(() => decrypt(encrypted, wrongKey)).toThrow()
    })

    it('should throw on tampered ciphertext', { timeout: 10000 }, () => {
      const plaintext = 'Secret data'
      const encrypted = encrypt(plaintext, key)
      const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -2) + '00' }
      expect(() => decrypt(tampered, key)).toThrow()
    })

    it('should throw on tampered auth tag', () => {
      const plaintext = 'Secret data'
      const encrypted = encrypt(plaintext, key)
      const tampered = { ...encrypted, authTag: encrypted.authTag.slice(0, -2) + '00' }
      expect(() => decrypt(tampered, key)).toThrow()
    })
  })

  describe('encryptJSON/decryptJSON', () => {
    it('should encrypt and decrypt a JSON object', () => {
      const data = { username: 'user', password: 'pass123', notes: 'test' }
      const encrypted = encryptJSON(data, key)
      const decrypted = decryptJSON<{ username: string; password: string; notes: string }>(encrypted, key)
      expect(decrypted).toEqual(data)
    })

    it('should handle nested objects', () => {
      const data = {
        outer: {
          inner: {
            value: 42,
            array: [1, 2, 3],
          },
        },
      }
      const encrypted = encryptJSON(data, key)
      const decrypted = decryptJSON<typeof data>(encrypted, key)
      expect(decrypted).toEqual(data)
    })

    it('should handle arrays', () => {
      const data = [1, 'two', { three: 3 }, [4, 5]]
      const encrypted = encryptJSON(data, key)
      const decrypted = decryptJSON<typeof data>(encrypted, key)
      expect(decrypted).toEqual(data)
    })

    it('should handle null and undefined values', () => {
      const data = { a: null, b: undefined, c: 'value' }
      const encrypted = encryptJSON(data, key)
      const decrypted = decryptJSON<typeof data>(encrypted, key)
      expect(decrypted.a).toBeNull()
      expect(decrypted.b).toBeUndefined()
      expect(decrypted.c).toBe('value')
    })
  })
})
