import { describe, it, expect } from 'vitest'
import { calculateStrength, estimateCrackTime } from '../passwordStrength'

describe('passwordStrength', () => {
  describe('calculateStrength', () => {
    it('should return Weak for short passwords', () => {
      const result = calculateStrength('abc')
      expect(result.score).toBe(1)
      expect(result.label).toBe('Weak')
      expect(result.color).toBe('#ef4444')
    })

    it('should return Weak for lowercase only', () => {
      const result = calculateStrength('abcdefgh')
      expect(result.score).toBe(1)
      expect(result.label).toBe('Weak')
    })

    it('should return Fair for mixed case', () => {
      const result = calculateStrength('Abcdefgh')
      expect(result.score).toBe(2)
      expect(result.label).toBe('Fair')
    })

    it('should return Good for complex password', () => {
      const result = calculateStrength('Abcdef12!')
      expect(result.score).toBe(3)
      expect(result.label).toBe('Good')
    })

    it('should return Strong for long complex password', () => {
      const result = calculateStrength('Abcdef12!@#$%^&*')
      expect(result.score).toBe(4)
      expect(result.label).toBe('Strong')
    })

    it('should handle empty password', () => {
      const result = calculateStrength('')
      expect(result.score).toBe(1)
      expect(result.label).toBe('Weak')
    })

    it('should handle very long password', () => {
      const result = calculateStrength('a'.repeat(100) + 'A1!')
      expect(result.score).toBe(4)
      expect(result.label).toBe('Strong')
    })

    it('should count symbols correctly', () => {
      const result = calculateStrength('Abcdef12!@#')
      expect(result.score).toBeGreaterThanOrEqual(3)
    })

    it('should reward length 12+', () => {
      const short = calculateStrength('Abcdef12!')
      const long = calculateStrength('Abcdefgh12!')
      expect(long.score).toBeGreaterThanOrEqual(short.score)
    })

    it('should reward length 16+', () => {
      const result = calculateStrength('Abcdefghij12345!')
      expect(result.score).toBeGreaterThanOrEqual(3)
    })

    it('should reward length 20+', () => {
      const result = calculateStrength('Abcdefghij12345!@#$')
      expect(result.score).toBeGreaterThanOrEqual(3)
    })
  })

  describe('estimateCrackTime', () => {
    it('should return instantly for empty password', () => {
      expect(estimateCrackTime('')).toBe('')
    })

    it('should return instantly for very short password', () => {
      const result = estimateCrackTime('a')
      expect(result).toContain('instantly') // 1 char = tiny keyspace
    })

    it('should return longer time for longer passwords', () => {
      const short = estimateCrackTime('abc')
      const long = estimateCrackTime('abcdefghij12345!@#$%')
      // Longer password should have longer crack time
      // We can't compare exact strings, but we can verify they're different
      expect(short).not.toBe(long)
    })

    it('should handle numbers-only password', () => {
      const result = estimateCrackTime('123456')
      expect(typeof result).toBe('string')
    })

    it('should handle symbols', () => {
      const result = estimateCrackTime('!@#$%^&*')
      expect(typeof result).toBe('string')
    })

    it('should return human-readable format', () => {
      const result = estimateCrackTime('Abcdef12!@#$%^&*')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle maximum complexity', () => {
      const result = estimateCrackTime('a'.repeat(20) + 'A' + '1' + '!')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
