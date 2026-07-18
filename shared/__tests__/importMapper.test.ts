import { describe, it, expect } from 'vitest'
import { mapColumns, detectCSVSource, mapEntryType } from '../importMapper'

describe('Import Mapper', () => {
  describe('mapColumns', () => {
    it('should map Bitwarden CSV headers', () => {
      const result = mapColumns('name,login_uri,login_username,login_password,notes')
      expect(result.nameIdx).toBe(0)
      expect(result.urlIdx).toBe(1)
      expect(result.userIdx).toBe(2)
      expect(result.passIdx).toBe(3)
      expect(result.notesIdx).toBe(4)
    })

    it('should map 1Password CSV headers', () => {
      const result = mapColumns('Title,URL,Username,Password,Notes')
      expect(result.nameIdx).toBe(0)
      expect(result.urlIdx).toBe(1)
      expect(result.userIdx).toBe(2)
      expect(result.passIdx).toBe(3)
      expect(result.notesIdx).toBe(4)
    })

    it('should map Chrome CSV headers', () => {
      const result = mapColumns('name,url,username,password')
      expect(result.nameIdx).toBe(0)
      expect(result.urlIdx).toBe(1)
      expect(result.userIdx).toBe(2)
      expect(result.passIdx).toBe(3)
    })

    it('should handle TOTP column', () => {
      const result = mapColumns('name,url,username,password,notes,totp')
      expect(result.totpIdx).toBe(5)
    })
  })

  describe('detectCSVSource', () => {
    it('should detect Bitwarden', () => {
      expect(detectCSVSource('name,login_uri,login_username,login_password')).toBe('bitwarden')
    })

    it('should detect 1Password', () => {
      expect(detectCSVSource('Title,websiteLocation,webaccount_username,Password')).toBe('1password')
    })

    it('should detect LastPass', () => {
      expect(detectCSVSource('url,username,password,totp,extra,name,grouping,fav')).toBe('lastpass')
    })

    it('should return generic for unknown', () => {
      expect(detectCSVSource('name,url,username,password')).toBe('generic')
    })
  })

  describe('mapEntryType', () => {
    it('should map login type', () => {
      expect(mapEntryType('login', 'generic')).toBe('login')
    })

    it('should map note type', () => {
      expect(mapEntryType('note', 'generic')).toBe('secure_note')
    })

    it('should map credit card type', () => {
      expect(mapEntryType('credit card', 'generic')).toBe('card')
    })

    it('should default to login for empty type', () => {
      expect(mapEntryType('', 'generic')).toBe('login')
    })

    it('should handle Bitwarden string types', () => {
      expect(mapEntryType('login', 'bitwarden')).toBe('login')
      expect(mapEntryType('secure_note', 'bitwarden')).toBe('secure_note')
      expect(mapEntryType('card', 'bitwarden')).toBe('card')
      expect(mapEntryType('identity', 'bitwarden')).toBe('identity')
    })
  })
})
