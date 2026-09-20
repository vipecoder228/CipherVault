import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────
vi.mock('../webDb', () => ({
  getWebDatabase: vi.fn(),
  saveWebDatabase: vi.fn(),
  webQueryAll: vi.fn(),
  webQueryOne: vi.fn(),
  webRun: vi.fn(),
}))

vi.mock('../webAttachmentStorage', () => ({
  newStorageKey: vi.fn(),
  writeAttachmentFile: vi.fn(),
  readAttachmentFile: vi.fn(),
  deleteAttachmentFile: vi.fn(),
}))

vi.mock('../../../shared/crypto/encryption', () => ({
  encryptBytes: vi.fn(),
  decryptBytes: vi.fn(),
}))

// ─── Imports ────────────────────────────────────────────
import {
  listAttachments,
  addAttachment,
  getAttachmentData,
  deleteAttachmentById,
  getStorageKeysForEntry,
  getStorageKeysForDeletedEntries,
  reencryptVaultAttachments,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_PER_ENTRY,
} from '../webAttachments'

import * as webDb from '../webDb'
import * as webAttachmentStorage from '../webAttachmentStorage'
import * as encryption from '../../../shared/crypto/encryption'

const mockGetWebDatabase = vi.mocked(webDb.getWebDatabase)
const mockSaveWebDatabase = vi.mocked(webDb.saveWebDatabase)
const mockWebQueryAll = vi.mocked(webDb.webQueryAll)
const mockWebQueryOne = vi.mocked(webDb.webQueryOne)
const mockWebRun = vi.mocked(webDb.webRun)

const encKey = new Uint8Array(32).fill(7)

describe('webAttachments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetWebDatabase.mockResolvedValue({} as any)
  })

  // ─── listAttachments ────────────────────────────────────
  describe('listAttachments', () => {
    it('returns empty array when vault is locked', async () => {
      const result = await listAttachments(1, null)

      expect(result).toEqual([])
      expect(mockWebQueryAll).not.toHaveBeenCalled()
    })

    it('returns attachments for entry when vault is unlocked', async () => {
      const mockRows = [{ id: 1, entry_id: 5, storage_key: 'k1', filename: 'a.txt', mime_type: 'text/plain', size: 10, created_at: '2024-01-01' }]
      mockWebQueryAll.mockReturnValue(mockRows as any)

      const result = await listAttachments(5, encKey)

      expect(result).toEqual(mockRows)
    })
  })

  // ─── addAttachment ──────────────────────────────────────
  describe('addAttachment', () => {
    it('throws when vault is locked', async () => {
      await expect(addAttachment(1, 'file.txt', 'text/plain', new Uint8Array([1, 2]), null)).rejects.toThrow('Vault is locked')
    })

    it('throws when file exceeds max size', async () => {
      const oversized = new Uint8Array(MAX_ATTACHMENT_SIZE + 1)

      await expect(addAttachment(1, 'big.bin', 'application/octet-stream', oversized, encKey)).rejects.toThrow(/exceeds maximum size/)
    })

    it('throws when entry does not exist', async () => {
      mockWebQueryOne.mockReturnValueOnce(undefined)

      await expect(addAttachment(999, 'file.txt', 'text/plain', new Uint8Array([1, 2]), encKey)).rejects.toThrow('Entry not found')
    })

    it('throws when entry already has the max number of attachments', async () => {
      mockWebQueryOne.mockReturnValueOnce({ id: 1 } as any)
      mockWebQueryAll.mockReturnValueOnce(
        Array.from({ length: MAX_ATTACHMENTS_PER_ENTRY }, (_, i) => ({ id: i })) as any
      )

      await expect(addAttachment(1, 'file.txt', 'text/plain', new Uint8Array([1, 2]), encKey)).rejects.toThrow(/at most/)
    })

    it('encrypts data, writes the file, and persists metadata', async () => {
      mockWebQueryOne.mockReturnValueOnce({ id: 1 } as any) // entry lookup
      mockWebQueryAll.mockReturnValueOnce([]) // existing attachments
      const encrypted = { iv: 'iv1', ciphertext: new Uint8Array([9, 9]), authTag: 'tag1' }
      vi.mocked(encryption.encryptBytes).mockResolvedValue(encrypted)
      vi.mocked(webAttachmentStorage.newStorageKey).mockReturnValue('storage-key-1')
      const meta = { id: 42, entry_id: 1, storage_key: 'storage-key-1', filename: 'file.txt', mime_type: 'text/plain', size: 2, created_at: '2024-01-01' }
      mockWebQueryOne.mockReturnValueOnce(meta as any) // re-select after insert

      const data = new Uint8Array([1, 2])
      const result = await addAttachment(1, 'file.txt', 'text/plain', data, encKey)

      expect(encryption.encryptBytes).toHaveBeenCalledWith(data, encKey)
      expect(webAttachmentStorage.writeAttachmentFile).toHaveBeenCalledWith('storage-key-1', encrypted.ciphertext)
      expect(mockWebRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attachments'),
        [1, 'storage-key-1', 'file.txt', 'text/plain', 2, 'iv1', 'tag1']
      )
      expect(mockSaveWebDatabase).toHaveBeenCalled()
      expect(result).toEqual(meta)
    })

    it('cleans up the written file if the DB insert fails', async () => {
      mockWebQueryOne.mockReturnValueOnce({ id: 1 } as any)
      mockWebQueryAll.mockReturnValueOnce([])
      vi.mocked(encryption.encryptBytes).mockResolvedValue({ iv: 'iv1', ciphertext: new Uint8Array([9, 9]), authTag: 'tag1' })
      vi.mocked(webAttachmentStorage.newStorageKey).mockReturnValue('storage-key-1')
      mockWebRun.mockImplementation(() => { throw new Error('db insert failed') })

      await expect(addAttachment(1, 'file.txt', 'text/plain', new Uint8Array([1, 2]), encKey)).rejects.toThrow('db insert failed')

      expect(webAttachmentStorage.deleteAttachmentFile).toHaveBeenCalledWith('storage-key-1')
      expect(mockSaveWebDatabase).not.toHaveBeenCalled()
    })
  })

  // ─── getAttachmentData ──────────────────────────────────
  describe('getAttachmentData', () => {
    it('throws when vault is locked', async () => {
      await expect(getAttachmentData(1, null)).rejects.toThrow('Vault is locked')
    })

    it('returns null when attachment does not exist', async () => {
      mockWebQueryOne.mockReturnValueOnce(undefined)

      const result = await getAttachmentData(999, encKey)

      expect(result).toBeNull()
    })

    it('reads and decrypts the attachment file', async () => {
      const row = { id: 1, entry_id: 5, storage_key: 'k1', filename: 'a.txt', mime_type: 'text/plain', size: 2, created_at: '2024-01-01', iv: 'iv1', auth_tag: 'tag1' }
      mockWebQueryOne.mockReturnValueOnce(row as any)
      vi.mocked(webAttachmentStorage.readAttachmentFile).mockResolvedValue(new Uint8Array([1, 2, 3]))
      vi.mocked(encryption.decryptBytes).mockResolvedValue(new Uint8Array([4, 5, 6]))

      const result = await getAttachmentData(1, encKey)

      expect(encryption.decryptBytes).toHaveBeenCalledWith(
        { iv: 'iv1', ciphertext: new Uint8Array([1, 2, 3]), authTag: 'tag1' },
        encKey
      )
      expect(result!.data).toEqual(new Uint8Array([4, 5, 6]))
      expect(result!.meta.filename).toBe('a.txt')
    })
  })

  // ─── deleteAttachmentById ───────────────────────────────
  describe('deleteAttachmentById', () => {
    it('throws when vault is locked', async () => {
      await expect(deleteAttachmentById(1, null)).rejects.toThrow('Vault is locked')
    })

    it('no-ops when the attachment does not exist', async () => {
      mockWebQueryOne.mockReturnValueOnce(undefined)

      await deleteAttachmentById(999, encKey)

      expect(mockWebRun).not.toHaveBeenCalled()
      expect(webAttachmentStorage.deleteAttachmentFile).not.toHaveBeenCalled()
    })

    it('deletes the DB row before deleting the file on disk', async () => {
      const row = { id: 1, storage_key: 'k1' }
      mockWebQueryOne.mockReturnValueOnce(row as any)

      await deleteAttachmentById(1, encKey)

      expect(mockWebRun).toHaveBeenCalledWith('DELETE FROM attachments WHERE id = ?', [1])
      expect(mockSaveWebDatabase).toHaveBeenCalled()
      expect(webAttachmentStorage.deleteAttachmentFile).toHaveBeenCalledWith('k1')
    })
  })

  // ─── getStorageKeysForEntry / getStorageKeysForDeletedEntries ──
  describe('getStorageKeysForEntry', () => {
    it('returns storage keys for the given entry', () => {
      mockWebQueryAll.mockReturnValueOnce([{ storage_key: 'k1' }, { storage_key: 'k2' }] as any)

      const result = getStorageKeysForEntry(5)

      expect(result).toEqual(['k1', 'k2'])
    })
  })

  describe('getStorageKeysForDeletedEntries', () => {
    it('returns storage keys for entries deleted more than N days ago', () => {
      mockWebQueryAll.mockReturnValueOnce([{ storage_key: 'k3' }] as any)

      const result = getStorageKeysForDeletedEntries(30)

      expect(mockWebQueryAll).toHaveBeenCalledWith(expect.stringContaining('deleted_at'), [30])
      expect(result).toEqual(['k3'])
    })
  })

  // ─── reencryptVaultAttachments ──────────────────────────
  describe('reencryptVaultAttachments', () => {
    it('re-encrypts every attachment belonging to the vault with the new key', async () => {
      const oldKey = new Uint8Array(32).fill(1)
      const newKey = new Uint8Array(32).fill(2)
      const rows = [
        { id: 1, storage_key: 'k1', iv: 'iv1', auth_tag: 'tag1' },
        { id: 2, storage_key: 'k2', iv: 'iv2', auth_tag: 'tag2' },
      ]
      mockWebQueryAll.mockReturnValueOnce(rows as any)
      vi.mocked(webAttachmentStorage.readAttachmentFile).mockResolvedValue(new Uint8Array([9]))
      vi.mocked(encryption.decryptBytes).mockResolvedValue(new Uint8Array([8]))
      vi.mocked(encryption.encryptBytes).mockResolvedValue({ iv: 'newiv', ciphertext: new Uint8Array([7]), authTag: 'newtag' })

      await reencryptVaultAttachments(1, oldKey, newKey)

      expect(mockWebQueryAll).toHaveBeenCalledWith(expect.stringContaining('WHERE e.vault_id = ?'), [1])
      expect(encryption.decryptBytes).toHaveBeenCalledTimes(2)
      expect(encryption.encryptBytes).toHaveBeenCalledWith(new Uint8Array([8]), newKey)
      expect(webAttachmentStorage.writeAttachmentFile).toHaveBeenCalledTimes(2)
      expect(mockWebRun).toHaveBeenCalledWith('UPDATE attachments SET iv = ?, auth_tag = ? WHERE id = ?', ['newiv', 'newtag', 1])
      expect(mockWebRun).toHaveBeenCalledWith('UPDATE attachments SET iv = ?, auth_tag = ? WHERE id = ?', ['newiv', 'newtag', 2])
    })

    it('does nothing when the vault has no attachments', async () => {
      mockWebQueryAll.mockReturnValueOnce([])

      await reencryptVaultAttachments(1, new Uint8Array(32), new Uint8Array(32))

      expect(webAttachmentStorage.readAttachmentFile).not.toHaveBeenCalled()
      expect(webAttachmentStorage.writeAttachmentFile).not.toHaveBeenCalled()
    })
  })
})
