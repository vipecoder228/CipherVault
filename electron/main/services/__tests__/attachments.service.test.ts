import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'

// ─── Mocks ──────────────────────────────────────────────
vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(),
  saveDatabase: vi.fn(),
}))

vi.mock('../../db/queries/attachments.queries', () => ({
  getAttachmentsForEntry: vi.fn(),
  getAttachmentById: vi.fn(),
  createAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  getAttachmentsForVault: vi.fn(),
  updateAttachmentEncryption: vi.fn(),
}))

vi.mock('../../db/queries/entries.queries', () => ({
  getEntryByIdIncludingDeleted: vi.fn(),
}))

vi.mock('../../db/attachmentStorage', () => ({
  newStorageKey: vi.fn(),
  writeAttachmentFile: vi.fn(),
  readAttachmentFile: vi.fn(),
  deleteAttachmentFile: vi.fn(),
}))

vi.mock('../../crypto/encryption', () => ({
  encryptBuffer: vi.fn(),
  decryptBuffer: vi.fn(),
}))

vi.mock('../vault.service', () => ({
  getEncryptionKey: vi.fn(),
}))

// ─── Imports ────────────────────────────────────────────
import {
  listAttachments,
  addAttachment,
  getAttachmentData,
  deleteAttachmentById,
  reencryptVaultAttachments,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_PER_ENTRY,
} from '../attachments.service'

import * as dbConnection from '../../db/connection'
import * as attachmentsQueries from '../../db/queries/attachments.queries'
import * as entriesQueries from '../../db/queries/entries.queries'
import * as attachmentStorage from '../../db/attachmentStorage'
import * as encryption from '../../crypto/encryption'
import * as vaultService from '../vault.service'

const mockGetDatabase = vi.mocked(dbConnection.getDatabase)
const mockSaveDatabase = vi.mocked(dbConnection.saveDatabase)
const mockGetEncryptionKey = vi.mocked(vaultService.getEncryptionKey)

const encKey = randomBytes(32)

function makeMockDb() {
  return {} as any
}

describe('AttachmentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDatabase.mockResolvedValue(makeMockDb())
  })

  // ─── listAttachments ────────────────────────────────────
  describe('listAttachments', () => {
    it('returns empty array when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      const result = await listAttachments(1)

      expect(result).toEqual([])
      expect(attachmentsQueries.getAttachmentsForEntry).not.toHaveBeenCalled()
    })

    it('returns attachments for entry when vault is unlocked', async () => {
      const mockRows = [{ id: 1, entry_id: 5, storage_key: 'k1', filename: 'a.txt', mime_type: 'text/plain', size: 10, created_at: '2024-01-01' }]
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(attachmentsQueries.getAttachmentsForEntry).mockReturnValue(mockRows as any)

      const result = await listAttachments(5)

      expect(result).toEqual(mockRows)
    })
  })

  // ─── addAttachment ──────────────────────────────────────
  describe('addAttachment', () => {
    it('throws when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      await expect(addAttachment(1, 'file.txt', 'text/plain', Buffer.from('data'))).rejects.toThrow('Vault is locked')
    })

    it('throws when file exceeds max size', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      const oversized = Buffer.alloc(MAX_ATTACHMENT_SIZE + 1)

      await expect(addAttachment(1, 'big.bin', 'application/octet-stream', oversized)).rejects.toThrow(/exceeds maximum size/)
    })

    it('throws when entry does not exist', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryByIdIncludingDeleted).mockReturnValue(undefined)

      await expect(addAttachment(999, 'file.txt', 'text/plain', Buffer.from('data'))).rejects.toThrow('Entry not found')
    })

    it('throws when entry already has the max number of attachments', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryByIdIncludingDeleted).mockReturnValue({ id: 1 } as any)
      vi.mocked(attachmentsQueries.getAttachmentsForEntry).mockReturnValue(
        Array.from({ length: MAX_ATTACHMENTS_PER_ENTRY }, (_, i) => ({ id: i })) as any
      )

      await expect(addAttachment(1, 'file.txt', 'text/plain', Buffer.from('data'))).rejects.toThrow(/at most/)
    })

    it('encrypts data, writes the file, and persists metadata', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryByIdIncludingDeleted).mockReturnValue({ id: 1 } as any)
      vi.mocked(attachmentsQueries.getAttachmentsForEntry).mockReturnValue([])
      const encrypted = { iv: 'iv1', ciphertext: Buffer.from('cipher'), authTag: 'tag1' }
      vi.mocked(encryption.encryptBuffer).mockReturnValue(encrypted)
      vi.mocked(attachmentStorage.newStorageKey).mockReturnValue('storage-key-1')
      const meta = { id: 42, entry_id: 1, storage_key: 'storage-key-1', filename: 'file.txt', mime_type: 'text/plain', size: 4, created_at: '2024-01-01' }
      vi.mocked(attachmentsQueries.createAttachment).mockReturnValue(meta as any)

      const result = await addAttachment(1, 'file.txt', 'text/plain', Buffer.from('data'))

      expect(encryption.encryptBuffer).toHaveBeenCalledWith(Buffer.from('data'), encKey)
      expect(attachmentStorage.writeAttachmentFile).toHaveBeenCalledWith('storage-key-1', encrypted.ciphertext)
      expect(attachmentsQueries.createAttachment).toHaveBeenCalledWith(
        expect.anything(), 1, 'storage-key-1', 'file.txt', 'text/plain', 4, 'iv1', 'tag1'
      )
      expect(mockSaveDatabase).toHaveBeenCalled()
      expect(result).toEqual(meta)
    })

    it('cleans up the written file if the DB insert fails', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(entriesQueries.getEntryByIdIncludingDeleted).mockReturnValue({ id: 1 } as any)
      vi.mocked(attachmentsQueries.getAttachmentsForEntry).mockReturnValue([])
      vi.mocked(encryption.encryptBuffer).mockReturnValue({ iv: 'iv1', ciphertext: Buffer.from('cipher'), authTag: 'tag1' })
      vi.mocked(attachmentStorage.newStorageKey).mockReturnValue('storage-key-1')
      vi.mocked(attachmentsQueries.createAttachment).mockImplementation(() => { throw new Error('db insert failed') })

      await expect(addAttachment(1, 'file.txt', 'text/plain', Buffer.from('data'))).rejects.toThrow('db insert failed')

      expect(attachmentStorage.deleteAttachmentFile).toHaveBeenCalledWith('storage-key-1')
      expect(mockSaveDatabase).not.toHaveBeenCalled()
    })
  })

  // ─── getAttachmentData ──────────────────────────────────
  describe('getAttachmentData', () => {
    it('throws when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      await expect(getAttachmentData(1)).rejects.toThrow('Vault is locked')
    })

    it('returns null when attachment does not exist', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(attachmentsQueries.getAttachmentById).mockReturnValue(undefined)

      const result = await getAttachmentData(999)

      expect(result).toBeNull()
    })

    it('reads and decrypts the attachment file', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      const row = { id: 1, entry_id: 5, storage_key: 'k1', filename: 'a.txt', mime_type: 'text/plain', size: 4, created_at: '2024-01-01', iv: 'iv1', auth_tag: 'tag1' }
      vi.mocked(attachmentsQueries.getAttachmentById).mockReturnValue(row as any)
      vi.mocked(attachmentStorage.readAttachmentFile).mockReturnValue(Buffer.from('ciphertext'))
      vi.mocked(encryption.decryptBuffer).mockReturnValue(Buffer.from('plaintext'))

      const result = await getAttachmentData(1)

      expect(encryption.decryptBuffer).toHaveBeenCalledWith(
        { iv: 'iv1', ciphertext: Buffer.from('ciphertext'), authTag: 'tag1' },
        encKey
      )
      expect(result!.data).toEqual(Buffer.from('plaintext'))
      expect(result!.meta.filename).toBe('a.txt')
    })
  })

  // ─── deleteAttachmentById ───────────────────────────────
  describe('deleteAttachmentById', () => {
    it('throws when vault is locked', async () => {
      mockGetEncryptionKey.mockReturnValue(null)

      await expect(deleteAttachmentById(1)).rejects.toThrow('Vault is locked')
    })

    it('no-ops when the attachment does not exist', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      vi.mocked(attachmentsQueries.getAttachmentById).mockReturnValue(undefined)

      await deleteAttachmentById(999)

      expect(attachmentsQueries.deleteAttachment).not.toHaveBeenCalled()
      expect(attachmentStorage.deleteAttachmentFile).not.toHaveBeenCalled()
    })

    it('deletes the DB row before deleting the file on disk', async () => {
      mockGetEncryptionKey.mockReturnValue(encKey)
      const row = { id: 1, storage_key: 'k1' }
      vi.mocked(attachmentsQueries.getAttachmentById).mockReturnValue(row as any)

      await deleteAttachmentById(1)

      expect(attachmentsQueries.deleteAttachment).toHaveBeenCalledWith(expect.anything(), 1)
      expect(mockSaveDatabase).toHaveBeenCalled()
      expect(attachmentStorage.deleteAttachmentFile).toHaveBeenCalledWith('k1')
    })
  })

  // ─── reencryptVaultAttachments ──────────────────────────
  describe('reencryptVaultAttachments', () => {
    it('re-encrypts every attachment belonging to the vault with the new key', async () => {
      const oldKey = randomBytes(32)
      const newKey = randomBytes(32)
      const rows = [
        { id: 1, storage_key: 'k1', iv: 'iv1', auth_tag: 'tag1' },
        { id: 2, storage_key: 'k2', iv: 'iv2', auth_tag: 'tag2' },
      ]
      vi.mocked(attachmentsQueries.getAttachmentsForVault).mockReturnValue(rows as any)
      vi.mocked(attachmentStorage.readAttachmentFile).mockReturnValue(Buffer.from('cipher'))
      vi.mocked(encryption.decryptBuffer).mockReturnValue(Buffer.from('plain'))
      vi.mocked(encryption.encryptBuffer).mockReturnValue({ iv: 'newiv', ciphertext: Buffer.from('newcipher'), authTag: 'newtag' })

      await reencryptVaultAttachments(1, oldKey, newKey)

      expect(attachmentsQueries.getAttachmentsForVault).toHaveBeenCalledWith(expect.anything(), 1)
      expect(encryption.decryptBuffer).toHaveBeenCalledTimes(2)
      expect(encryption.encryptBuffer).toHaveBeenCalledWith(Buffer.from('plain'), newKey)
      expect(attachmentStorage.writeAttachmentFile).toHaveBeenCalledTimes(2)
      expect(attachmentsQueries.updateAttachmentEncryption).toHaveBeenCalledWith(expect.anything(), 1, 'newiv', 'newtag')
      expect(attachmentsQueries.updateAttachmentEncryption).toHaveBeenCalledWith(expect.anything(), 2, 'newiv', 'newtag')
    })

    it('does nothing when the vault has no attachments', async () => {
      vi.mocked(attachmentsQueries.getAttachmentsForVault).mockReturnValue([])

      await reencryptVaultAttachments(1, randomBytes(32), randomBytes(32))

      expect(attachmentStorage.readAttachmentFile).not.toHaveBeenCalled()
      expect(attachmentStorage.writeAttachmentFile).not.toHaveBeenCalled()
    })
  })
})
