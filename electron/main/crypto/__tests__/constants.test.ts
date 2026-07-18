import { describe, it, expect } from 'vitest'
import { CRYPTO } from '../constants'

describe('Crypto Constants', () => {
  it('should have 600K PBKDF2 iterations (OWASP compliant)', () => {
    expect(CRYPTO.PBKDF2.ITERATIONS).toBe(600_000)
  })

  it('should have 64-byte key length', () => {
    expect(CRYPTO.PBKDF2.KEY_LENGTH).toBe(64)
  })

  it('should use SHA-256 digest', () => {
    expect(CRYPTO.PBKDF2.DIGEST).toBe('sha256')
  })

  it('should have 32-byte salt', () => {
    expect(CRYPTO.SALT_SIZE).toBe(32)
  })

  it('should have 12-byte IV (GCM recommended)', () => {
    expect(CRYPTO.IV_SIZE).toBe(12)
  })

  it('should have 16-byte auth tag', () => {
    expect(CRYPTO.AUTH_TAG_SIZE).toBe(16)
  })

  it('should use AES-GCM', () => {
    expect(CRYPTO.ENCRYPTION_ALGO).toBe('aes-256-gcm')
  })
})
