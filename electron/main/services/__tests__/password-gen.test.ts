import { describe, it, expect } from 'vitest'
import { generatePassword, generateUsername, generatePassphrase } from '../password-gen.service'

describe('Password Generator', () => {
  describe('generatePassword', () => {
    it('should generate a password of the specified length', () => {
      const password = generatePassword({
        length: 16,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      })
      expect(password.length).toBe(16)
    })

    it('should respect minimum length of 8', () => {
      const password = generatePassword({
        length: 4,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      })
      expect(password.length).toBe(8)
    })

    it('should respect maximum length of 128', () => {
      const password = generatePassword({
        length: 200,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      })
      expect(password.length).toBe(128)
    })

    it('should contain uppercase letters when enabled', () => {
      const password = generatePassword({
        length: 32,
        uppercase: true,
        lowercase: false,
        numbers: false,
        symbols: false,
      })
      expect(/[A-Z]/.test(password)).toBe(true)
    })

    it('should contain lowercase letters when enabled', () => {
      const password = generatePassword({
        length: 32,
        uppercase: false,
        lowercase: true,
        numbers: false,
        symbols: false,
      })
      expect(/[a-z]/.test(password)).toBe(true)
    })

    it('should contain numbers when enabled', () => {
      const password = generatePassword({
        length: 32,
        uppercase: false,
        lowercase: false,
        numbers: true,
        symbols: false,
      })
      expect(/[0-9]/.test(password)).toBe(true)
    })

    it('should contain symbols when enabled', () => {
      const password = generatePassword({
        length: 32,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: true,
      })
      expect(/[^a-zA-Z0-9]/.test(password)).toBe(true)
    })

    it('should fallback to lowercase when no options selected', () => {
      const password = generatePassword({
        length: 16,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
      })
      expect(/^[a-z]+$/.test(password)).toBe(true)
    })

    it('should contain at least one of each selected type', () => {
      const password = generatePassword({
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      })
      expect(/[A-Z]/.test(password)).toBe(true)
      expect(/[a-z]/.test(password)).toBe(true)
      expect(/[0-9]/.test(password)).toBe(true)
      expect(/[^a-zA-Z0-9]/.test(password)).toBe(true)
    })
  })

  describe('generateUsername', () => {
    it('should generate a username', () => {
      const username = generateUsername()
      expect(typeof username).toBe('string')
      expect(username.length).toBeGreaterThan(0)
    })

    it('should generate unique usernames', () => {
      const usernames = new Set()
      for (let i = 0; i < 100; i++) {
        usernames.add(generateUsername())
      }
      // With 37 adjectives * 36 nouns * 100 numbers = 133,200 combinations
      // 100 should all be unique
      expect(usernames.size).toBe(100)
    })

    it('should match expected format (adjective + noun + number)', () => {
      const username = generateUsername()
      expect(/^[a-z]+[a-z]+\d{1,2}$/i.test(username)).toBe(true)
    })
  })

  describe('generatePassphrase', () => {
    it('should generate a passphrase with default 4 words', () => {
      const passphrase = generatePassphrase()
      const words = passphrase.split('-')
      expect(words.length).toBe(4)
    })

    it('should respect word count within bounds', () => {
      const min = generatePassphrase(2) // Should be clamped to 3
      const max = generatePassphrase(10) // Should be clamped to 8
      expect(min.split('-').length).toBe(3)
      expect(max.split('-').length).toBe(8)
    })

    it('should capitalize first letter of each word', () => {
      const passphrase = generatePassphrase()
      const words = passphrase.split('-')
      for (const word of words) {
        expect(/^[A-Z]/.test(word)).toBe(true)
      }
    })

    it('should join words with hyphens', () => {
      const passphrase = generatePassphrase()
      expect(passphrase).toMatch(/^[A-Z][a-z]+(-[A-Z][a-z]+)+$/)
    })

    it('should generate unique passphrases', () => {
      const passphrases = new Set()
      for (let i = 0; i < 50; i++) {
        passphrases.add(generatePassphrase())
      }
      expect(passphrases.size).toBe(50)
    })
  })
})
