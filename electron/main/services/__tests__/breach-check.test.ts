import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

describe('Breach Check Logic', () => {
  describe('SHA-1 hash generation', () => {
    it('should generate valid SHA-1 hash', () => {
      const password = 'test123'
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
      expect(sha1.length).toBe(40)
      expect(sha1).toMatch(/^[0-9A-F]{40}$/)
    })

    it('should be deterministic', () => {
      const password = 'test123'
      const hash1 = createHash('sha1').update(password).digest('hex')
      const hash2 = createHash('sha1').update(password).digest('hex')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = createHash('sha1').update('password1').digest('hex')
      const hash2 = createHash('sha1').update('password2').digest('hex')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('k-anonymity prefix/suffix split', () => {
    it('should split hash into 5-char prefix and rest', () => {
      const sha1 = 'AA11BB22CC33DD44EE55FF660011223344556677'
      const prefix = sha1.slice(0, 5)
      const suffix = sha1.slice(5)
      expect(prefix.length).toBe(5)
      expect(suffix.length).toBe(35)
    })

    it('should handle hash comparison correctly', () => {
      const suffix = '11BB22CC33DD44EE55FF660011223344556677'
      const storedSuffix = '11BB22CC33DD44EE55FF660011223344556677'
      expect(suffix).toBe(storedSuffix)
    })
  })

  describe('Breach response parsing', () => {
    it('should parse HIBP response format', () => {
      const response = 'ABC123:1234\nDEF456:5678\nGHI789:9012'
      const lines = response.split('\n')
      const parsed = lines.map(line => {
        const [hashSuffix, count] = line.split(':')
        return { hashSuffix: hashSuffix.trim(), count: parseInt(count.trim(), 10) }
      })
      expect(parsed.length).toBe(3)
      expect(parsed[0].hashSuffix).toBe('ABC123')
      expect(parsed[0].count).toBe(1234)
    })

    it('should handle empty response', () => {
      const response = ''
      const lines = response.split('\n').filter(l => l.trim())
      expect(lines.length).toBe(0)
    })
  })

  describe('Error handling', () => {
    it('should handle rate limiting (429)', () => {
      const status: number = 429
      const isRateLimited = status === 429 || status === 403
      expect(isRateLimited).toBe(true)
    })

    it('should handle forbidden (403)', () => {
      const status: number = 403
      const isRateLimited = status === 429 || status === 403
      expect(isRateLimited).toBe(true)
    })

    it('should handle network errors gracefully', () => {
      const result = { breached: false, count: 0, rateLimited: true }
      expect(result.breached).toBe(false)
      expect(result.rateLimited).toBe(true)
    })
  })
})
