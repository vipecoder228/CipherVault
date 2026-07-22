import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'

// ─── Mocks ──────────────────────────────────────────────
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return {
    ...actual,
    createCipheriv: vi.fn(),
    createDecipheriv: vi.fn(),
    randomBytes: vi.fn(actual.randomBytes),
  }
})

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
}))

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
}))

vi.mock('../../db/connection', () => ({
  getDatabasePath: vi.fn(),
  saveDatabase: vi.fn(),
  resetDatabase: vi.fn(),
}))

vi.mock('../../crypto/keyderivation', () => ({
  deriveKey: vi.fn(),
  splitDerivedKey: vi.fn(),
}))

vi.mock('../../utils/window', () => ({
  getWindow: vi.fn(),
}))

// ─── Imports ────────────────────────────────────────────
import { exportEncryptedBackup, importEncryptedBackup } from '../backup.service'
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { createCipheriv, createDecipheriv } from 'crypto'
import { dialog } from 'electron'
import { getDatabasePath, saveDatabase, resetDatabase } from '../../db/connection'
import { deriveKey, splitDerivedKey } from '../../crypto/keyderivation'
import { getWindow } from '../../utils/window'
import { CRYPTO } from '../../crypto/constants'

const HEADER_SIZE = 11 + 1 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE + CRYPTO.AUTH_TAG_SIZE
const VERSION = 1

function makeMockCipher() {
  return {
    update: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    final: vi.fn().mockReturnValue(Buffer.alloc(0)),
    getAuthTag: vi.fn().mockReturnValue(randomBytes(CRYPTO.AUTH_TAG_SIZE)),
  }
}

function makeMockDecipher() {
  return {
    update: vi.fn().mockReturnValue(Buffer.from('decrypted')),
    final: vi.fn().mockReturnValue(Buffer.alloc(0)),
    setAuthTag: vi.fn(),
  }
}

// ─── Tests ──────────────────────────────────────────────
describe('BackupService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDatabasePath).mockReturnValue('/mock/db.sqlite')
    vi.mocked(splitDerivedKey).mockReturnValue({
      encryptionKey: randomBytes(32),
      hmacKey: randomBytes(32),
    })
    // Default: mock cipher so export code doesn't crash before reaching dialog/window check
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('db-data'))
    vi.mocked(deriveKey).mockResolvedValue(randomBytes(64))
    vi.mocked(createCipheriv).mockReturnValue(makeMockCipher() as any)
  })

  // ─── exportEncryptedBackup ──────────────────────────────
  describe('exportEncryptedBackup', () => {
    it('should return error when no window is available', async () => {
      vi.mocked(getWindow).mockReturnValue(undefined)

      const result = await exportEncryptedBackup('testpass')

      expect(result).toEqual({ success: false, error: 'Нет доступного окна' })
      expect(saveDatabase).toHaveBeenCalled()
    })

    it('should return success false when dialog is canceled', async () => {
      vi.mocked(getWindow).mockReturnValue({} as any)
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: '' })

      const result = await exportEncryptedBackup('testpass')

      expect(result).toEqual({ success: false })
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('should write header + encrypted data on successful export', async () => {
      vi.mocked(getWindow).mockReturnValue({} as any)
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/backup.ciphervault' })

      const result = await exportEncryptedBackup('testpass')

      expect(result).toEqual({ success: true, path: '/backup.ciphervault' })
      expect(writeFileSync).toHaveBeenCalledTimes(1)
      const written = vi.mocked(writeFileSync).mock.calls[0][1] as Buffer
      expect(written.subarray(0, 11).toString('ascii')).toBe('CIPHERVAULT')
      expect(written[11]).toBe(VERSION)
    })
  })

  // ─── importEncryptedBackup ──────────────────────────────
  describe('importEncryptedBackup', () => {
    beforeEach(() => {
      // Mock dialog.showOpenDialog to return a file path
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/backup.ciphervault'],
      })
      vi.mocked(getWindow).mockReturnValue({} as any)
    })

    it('should return error for file too small', async () => {
      vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(10))

      const result = await importEncryptedBackup('testpass')

      expect(result).toEqual({ success: false, error: 'Файл бэкапа слишком мал' })
    })

    it('should return error for bad magic header', async () => {
      const buf = Buffer.alloc(HEADER_SIZE + 16)
      buf.write('WRONGMAGIC00', 0, 'ascii')
      vi.mocked(readFileSync).mockReturnValue(buf)

      const result = await importEncryptedBackup('testpass')

      expect(result).toEqual({ success: false, error: 'Неверный формат файла бэкапа' })
    })

    it('should return error for unsupported version', async () => {
      const buf = Buffer.alloc(HEADER_SIZE + 16)
      buf.write('CIPHERVAULT', 0, 'ascii')
      buf[11] = 99
      vi.mocked(readFileSync).mockReturnValue(buf)

      const result = await importEncryptedBackup('testpass')

      expect(result).toEqual({ success: false, error: 'Неподдерживаемая версия бэкапа' })
    })

    it('should decrypt and restore database on valid backup', async () => {
      const salt = randomBytes(CRYPTO.SALT_SIZE)
      const iv = randomBytes(CRYPTO.IV_SIZE)
      const authTag = randomBytes(CRYPTO.AUTH_TAG_SIZE)

      const fileBuffer = Buffer.concat([
        Buffer.from('CIPHERVAULT', 'ascii'),
        Buffer.from([1]),
        salt, iv, authTag,
        Buffer.from('encrypted-payload'),
      ])

      vi.mocked(readFileSync).mockReturnValue(fileBuffer)
      vi.mocked(deriveKey).mockResolvedValue(randomBytes(64))

      const mockDecipher = makeMockDecipher()
      vi.mocked(createDecipheriv).mockReturnValue(mockDecipher as any)

      const result = await importEncryptedBackup('testpass')

      expect(result).toEqual({ success: true })
      expect(splitDerivedKey).toHaveBeenCalled()
      expect(mockDecipher.setAuthTag).toHaveBeenCalledWith(authTag)
      expect(writeFileSync).toHaveBeenCalledWith('/mock/db.sqlite', Buffer.from('decrypted'))
      expect(resetDatabase).toHaveBeenCalled()
      expect(copyFileSync).toHaveBeenCalled()
    })
  })
})
