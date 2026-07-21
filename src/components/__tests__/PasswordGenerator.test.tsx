import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateStrength, estimateCrackTime } from '../../lib/passwordStrength'

describe('Password Strength Library', () => {
  describe('calculateStrength - edge cases', () => {
    it('should handle single character', () => {
      const r = calculateStrength('a')
      expect(r.score).toBe(1)
      expect(r.label).toBe('Weak')
    })

    it('should handle 7 characters (below 8 threshold)', () => {
      const r = calculateStrength('Abcdef1')
      expect(r.score).toBeLessThanOrEqual(2)
    })

    it('should handle exactly 8 characters', () => {
      const r = calculateStrength('Abcdef1!')
      expect(r.score).toBeGreaterThanOrEqual(2)
    })

    it('should handle exactly 12 characters', () => {
      const r = calculateStrength('Abcdefgh1234')
      expect(r.score).toBeGreaterThanOrEqual(2)
    })

    it('should handle exactly 16 characters', () => {
      const r = calculateStrength('Abcdefghij123456')
      expect(r.score).toBeGreaterThanOrEqual(3)
    })

    it('should handle exactly 20 characters', () => {
      const r = calculateStrength('Abcdefghij1234567890')
      expect(r.score).toBeGreaterThanOrEqual(3)
    })

    it('should handle unicode characters', () => {
      const r = calculateStrength('пароль123!')
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it('should handle emoji', () => {
      const r = calculateStrength('password🔑123!')
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it('should handle all special characters', () => {
      const r = calculateStrength('!@#$%^&*()_+-=')
      expect(r.score).toBeGreaterThanOrEqual(2)
    })

    it('should handle spaces', () => {
      const r = calculateStrength('hello world 123!')
      expect(r.score).toBeGreaterThanOrEqual(2)
    })

    it('should handle very long password 100 chars', () => {
      const r = calculateStrength('A'.repeat(50) + 'a'.repeat(50) + '1!')
      expect(r.score).toBe(4)
    })

    it('should return valid color hex', () => {
      const r = calculateStrength('test')
      expect(r.color).toMatch(/^#[0-9a-f]{6}$/i)
    })

    it('should return valid label', () => {
      const r = calculateStrength('test')
      expect(['Weak', 'Fair', 'Good', 'Strong']).toContain(r.label)
    })
  })

  describe('estimateCrackTime - edge cases', () => {
    it('should handle null-like inputs', () => {
      expect(estimateCrackTime('')).toBe('')
    })

    it('should return string for any input', () => {
      expect(typeof estimateCrackTime('a')).toBe('string')
      expect(typeof estimateCrackTime('ab')).toBe('string')
      expect(typeof estimateCrackTime('abc')).toBe('string')
    })

    it('should handle numbers only', () => {
      const r = estimateCrackTime('12345678')
      expect(typeof r).toBe('string')
      expect(r.length).toBeGreaterThan(0)
    })

    it('should handle lowercase only', () => {
      const r = estimateCrackTime('abcdefgh')
      expect(typeof r).toBe('string')
    })

    it('should handle uppercase only', () => {
      const r = estimateCrackTime('ABCDEFGH')
      expect(typeof r).toBe('string')
    })

    it('should handle mixed case', () => {
      const r = estimateCrackTime('AbCdEfGh')
      expect(typeof r).toBe('string')
    })

    it('should handle symbols only', () => {
      const r = estimateCrackTime('!@#$%^&*')
      expect(typeof r).toBe('string')
    })

    it('should handle max complexity 50 chars', () => {
      const r = estimateCrackTime('a'.repeat(25) + 'A'.repeat(25) + '1!')
      expect(typeof r).toBe('string')
    })

    it('should return non-empty string for valid passwords', () => {
      expect(estimateCrackTime('password123').length).toBeGreaterThan(0)
    })
  })
})
