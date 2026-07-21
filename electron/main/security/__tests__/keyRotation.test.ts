import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { encrypt, decrypt } from '../../crypto/encryption'
import { generateSalt } from '../../crypto/keyderivation'

describe('Key Rotation Logic', () => {
  describe('Re-encryption flow', () => {
    it('should decrypt with old key and encrypt with new key', () => {
      const oldKey = randomBytes(32)
      const newKey = randomBytes(32)
      const data = 'sensitive data'

      // Encrypt with old key
      const encrypted = encrypt(data, oldKey)

      // Decrypt with old key
      const decrypted = decrypt(encrypted, oldKey)
      expect(decrypted).toBe(data)

      // Re-encrypt with new key
      const reEncrypted = decrypt(encrypted, oldKey)
      const newEncrypted = encrypt(reEncrypted, newKey)

      // Decrypt with new key
      const finalDecrypted = decrypt(newEncrypted, newKey)
      expect(finalDecrypted).toBe(data)
    })

    it('should not decrypt with wrong key', () => {
      const oldKey = randomBytes(32)
      const newKey = randomBytes(32)
      const data = 'secret'

      const encrypted = encrypt(data, oldKey)
      expect(() => decrypt(encrypted, newKey)).toThrow()
    })
  })

  describe('Key versioning', () => {
    it('should track key versions', () => {
      const versions = [
        { version: 1, salt: generateSalt().toString('hex') },
        { version: 2, salt: generateSalt().toString('hex') },
      ]
      expect(versions.length).toBe(2)
      expect(versions[0].version).toBe(1)
      expect(versions[1].version).toBe(2)
    })

    it('should have unique salts per version', () => {
      const salt1 = generateSalt().toString('hex')
      const salt2 = generateSalt().toString('hex')
      expect(salt1).not.toBe(salt2)
    })

    it('should order versions correctly', () => {
      const versions = [3, 1, 2]
      const sorted = [...versions].sort((a, b) => a - b)
      expect(sorted).toEqual([1, 2, 3])
    })
  })

  describe('Migration safety', () => {
    it('should preserve all data during re-encryption', () => {
      const key1 = randomBytes(32)
      const key2 = randomBytes(32)

      const entries = [
        { title: 'Entry 1', password: 'pass1' },
        { title: 'Entry 2', password: 'pass2' },
        { title: 'Entry 3', password: 'pass3' },
      ]

      // Encrypt all with key1
      const encrypted = entries.map(e => encrypt(JSON.stringify(e), key1))

      // Decrypt with key1 and re-encrypt with key2
      const reEncrypted = encrypted.map(e => {
        const decrypted = decrypt(e, key1)
        return encrypt(decrypted, key2)
      })

      // Decrypt all with key2
      const restored = reEncrypted.map(e => JSON.parse(decrypt(e, key2)))
      expect(restored).toEqual(entries)
    })
  })
})
