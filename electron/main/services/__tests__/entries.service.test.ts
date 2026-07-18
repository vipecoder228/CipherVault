import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'

// ─── Mocks ──────────────────────────────────────────────
vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(),
  saveDatabase: vi.fn(),
}))

vi.mock('../../db/queries/entries.queries', () => ({
  getEntries: vi.fn(),
  getEntryById: vi.fn(),
  getDeletedEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  toggleFavorite: vi.fn(),
  deleteEntry: vi.fn(),
  restoreEntry: vi.fn(),
  permanentDeleteEntry: vi.fn(),
  permanentDeleteOldEntries: vi.fn(),
  searchEntries: vi.fn(),
}))

vi.mock('../../db/queries/history.queries', () => ({
  addHistoryEntry: vi.fn(),
  getEntryHistory: vi.fn(),
  getFullEntryHistory: vi.fn(),
}))

vi.mock('../../crypto/encryption', () => ({
  encryptJSON: vi.fn(),
  decryptJSON: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}))

vi.mock('../vault.service', () => ({
  getEncryptionKey: vi.fn(),
  getActiveVaultId: vi.fn(),
  getPanicEncryptionKey: vi.fn(),
  clearPanicKey: vi.fn(),
}))

vi.mock('../../crypto/totp', () => ({
  generateTOTPToken: vi.fn(),
}))

// ─── Imports ────────────────────────────────────────────
import {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntryById,
  restoreEntry,
  searchEntries,
  getPanicBackupEntries,
} from '../entries.service'

import * as dbConnection from '../../db/connection'
import * as entriesQueries from '../../db/queries/entries.queries'
import * as encryption from '../../crypto/encryption'
import * as vaultService from '../vault.service'

const mockGetDatabase = vi.mocked(dbConnection.getDatabase)
const mockSaveDatabase = vi.mocked(dbConnection.saveDatabase)
const mockGetEncryptionKey = vi.mocked(vaultService.getEncryptionKey)
const mockGetActiveVaultId = vi.mocked(vaultService.getActiveVaultId)
const mockGetPanicEncryptionKey = vi.mocked(vaultService.getPanicEncryptionKey)
const mockEncryptJSON = vi.mocked(encryption.encryptJSON)
const mockDecryptJSON = vi.mocked(encryption.decryptJSON)

const encKey = randomBytes(32)

function makeMockDb() {
  return {
    exec: vi.fn().mockReturnValue([{ values: [[0]] }]),
    run: vi.fn(),
  } as any
}

// ─── Tests ──────────────────────────────────────────────
describe('EntriesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDatabase.mockResolvedValue(makeMockDb())
  })

  // ─── listEntries ───────────────────────────────────────
  describe('listEntries', () => {
    it('should return empty array when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      const result = await listEntries()

      expect(result).toEqual([])
    })

    it('should return entries when vault is unlocked', async () => {
      const mockEntries = [{ id: 1, display_title: 'Test Entry' }]
      mockGetEncryptionKey.mockReturnValue(encKey)
      mockGetActiveVaultId.mockReturnValue(1)
      vi.mocked(entriesQueries.getEntries).mockReturnValue(mockEntries as any)

      const result = await listEntries()

      expect(result).toEqual(mockEntries)
    })
  })

  // ─── getEntry ──────────────────────────────────────────
  describe('getEntry', () => {
    it('should throw when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      await expect(getEntry(1)).rejects.toThrow('Vault is locked')
    })

    it('should return decrypted entry', async () => {
      const mockRow = {
        id: 1,
        iv: 'aabb',
        encrypted_data: 'ccdd',
        auth_tag: 'eeff',
        display_title: 'GitHub',
        created_at: '2024-01-01',
        updated_at: '2024-06-15',
      }
      const decryptedData = {
        title: 'GitHub',
        username: 'user@test.com',
        password: 'secret123',
        url: 'https://github.com',
        notes: '',
        totp_secret: '',
        card_number: '',
        card_holder: '',
        card_expiry: '',
        card_cvv: '',
        identity_first_name: '',
        identity_last_name: '',
        identity_phone: '',
        identity_email: '',
        identity_address: '',
        identity_ssn: '',
        identity_passport: '',
        identity_birthdate: '',
      }

      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryById).mockReturnValue(mockRow as any)
      mockDecryptJSON.mockReturnValue(decryptedData as any)

      const result = await getEntry(1)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(1)
      expect(result!.display_title).toBe('GitHub')
      expect(result!.username).toBe('user@test.com')
      expect(result!.password).toBe('secret123')
    })

    it('should return null for non-existent entry', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryById).mockReturnValue(undefined)

      const result = await getEntry(999)

      expect(result).toBeNull()
    })
  })

  // ─── createEntry ───────────────────────────────────────
  describe('createEntry', () => {
    it('should encrypt data and create entry', async () => {
      const payload = {
        entry_type: 'login' as const,
        title: 'My Login',
        username: 'user@test.com',
        password: 'pass123',
      }
      const encrypted = { ciphertext: 'cipher123', iv: 'iv456', authTag: 'tag789' }
      const dbEntry = { id: 1, display_title: 'My Login', entry_type: 'login' }

      mockGetEncryptionKey.mockReturnValue(encKey)
      mockGetActiveVaultId.mockReturnValue(1)
      mockEncryptJSON.mockReturnValue(encrypted)
      vi.mocked(entriesQueries.createEntry).mockReturnValue(dbEntry as any)

      const result = await createEntry(payload)

      expect(mockEncryptJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Login',
          username: 'user@test.com',
          password: 'pass123',
          url: '',
          notes: '',
        }),
        encKey,
      )
      expect(mockSaveDatabase).toHaveBeenCalled()
      expect(result).toEqual(dbEntry)
    })
  })

  // ─── updateEntry ───────────────────────────────────────
  describe('updateEntry', () => {
    it('should preserve unchanged fields when updating', async () => {
      const existingRow = {
        id: 1,
        iv: 'aa',
        encrypted_data: 'bb',
        auth_tag: 'cc',
        display_title: 'Old Title',
      }
      const existingData = {
        title: 'Old Title',
        username: 'user@test.com',
        password: 'oldpass',
        url: 'https://example.com',
        notes: 'some notes',
        totp_secret: '',
        card_number: '',
        card_holder: '',
        card_expiry: '',
        card_cvv: '',
        identity_first_name: '',
        identity_last_name: '',
        identity_phone: '',
        identity_email: '',
        identity_address: '',
        identity_ssn: '',
        identity_passport: '',
        identity_birthdate: '',
      }
      const encrypted = { ciphertext: 'newcipher', iv: 'newiv', authTag: 'newtag' }

      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryById).mockReturnValue(existingRow as any)
      mockDecryptJSON.mockReturnValue(existingData)
      mockEncryptJSON.mockReturnValue(encrypted)

      await updateEntry(1, { title: 'New Title' })

      // Verify the merged data preserves unchanged fields
      expect(mockEncryptJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Title',
          username: 'user@test.com',
          password: 'oldpass',
          url: 'https://example.com',
          notes: 'some notes',
        }),
        encKey,
      )
    })

    it('should throw when entry is not found', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryById).mockReturnValue(undefined)

      await expect(updateEntry(999, { title: 'X' })).rejects.toThrow('Entry not found')
    })
  })

  // ─── deleteEntryById ───────────────────────────────────
  describe('deleteEntryById', () => {
    it('should soft-delete an entry', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)

      await deleteEntryById(1)

      expect(entriesQueries.deleteEntry).toHaveBeenCalled()
      expect(mockSaveDatabase).toHaveBeenCalled()
    })

    it('should no-op when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      await deleteEntryById(1)

      expect(entriesQueries.deleteEntry).not.toHaveBeenCalled()
    })
  })

  // ─── restoreEntry ──────────────────────────────────────
  describe('restoreEntry', () => {
    it('should restore a soft-deleted entry', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)

      await restoreEntry(1)

      expect(entriesQueries.restoreEntry).toHaveBeenCalled()
      expect(mockSaveDatabase).toHaveBeenCalled()
    })
  })

  // ─── searchEntries ─────────────────────────────────────
  describe('searchEntries', () => {
    it('should return matching entries', async () => {
      const mockResults = [{ id: 1, display_title: 'GitHub' }]
      mockGetEncryptionKey.mockReturnValue(encKey)
      mockGetActiveVaultId.mockReturnValue(1)
      vi.mocked(entriesQueries.searchEntries).mockReturnValue(mockResults as any)

      const result = await searchEntries('GitHub')

      expect(result).toEqual(mockResults)
    })

    it('should return empty when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      const result = await searchEntries('test')

      expect(result).toEqual([])
    })
  })

  // ─── getPanicBackupEntries ─────────────────────────────
  describe('getPanicBackupEntries', () => {
    it('should decrypt entries with panic key', async () => {
      const mockEntries = [
        { id: 1, iv: 'aa', encrypted_data: 'bb', auth_tag: 'cc', display_title: 'Secret' },
      ]
      const decrypted = { title: 'Secret', username: 'user', password: 'pass' }

      mockGetActiveVaultId.mockReturnValue(1)
      vi.mocked(entriesQueries.getEntries).mockReturnValue(mockEntries as any)
      mockGetPanicEncryptionKey.mockReturnValue(encKey)
      mockDecryptJSON.mockReturnValue(decrypted as any)

      const result = await getPanicBackupEntries()

      expect(result[0].decrypted).toEqual(decrypted)
    })

    it('should return entries without decrypted data when no panic key', async () => {
      const mockEntries = [{ id: 1, display_title: 'Secret' }]

      mockGetActiveVaultId.mockReturnValue(1)
      vi.mocked(entriesQueries.getEntries).mockReturnValue(mockEntries as any)
      mockGetPanicEncryptionKey.mockReturnValue(null)

      const result = await getPanicBackupEntries()

      expect(result[0].decrypted).toBeUndefined()
    })
  })
})
