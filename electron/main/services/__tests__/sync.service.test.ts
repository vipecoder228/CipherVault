import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'crypto'

// ─── Mocks ──────────────────────────────────────────────
vi.mock('fs', () => ({
  watch: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
}))

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return {
    ...actual,
    createCipheriv: vi.fn(),
    createDecipheriv: vi.fn(),
    randomBytes: vi.fn(actual.randomBytes),
  }
})

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
}))

vi.mock('../../db/connection', () => ({
  getDatabasePath: vi.fn().mockReturnValue('/mock/db.sqlite'),
  saveDatabase: vi.fn(),
  getDatabase: vi.fn(),
  resetDatabase: vi.fn(),
}))

vi.mock('../../crypto/keyderivation', () => ({
  deriveKey: vi.fn(),
  splitDerivedKey: vi.fn(),
}))

vi.mock('../vault.service', () => ({
  isAlarmMode: vi.fn().mockReturnValue(false),
}))

vi.mock('../../utils/window', () => ({
  getWindow: vi.fn(),
}))

// ─── Imports ────────────────────────────────────────────
import { getSyncStatus, selectSyncFolder, syncNow, setSyncPassword, disableSync } from '../sync.service'
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs'
import { createCipheriv } from 'crypto'
import { dialog } from 'electron'
import { getDatabase, saveDatabase, resetDatabase } from '../../db/connection'
import { deriveKey, splitDerivedKey } from '../../crypto/keyderivation'
import { getWindow } from '../../utils/window'

function makeMockDb() {
  return {
    exec: vi.fn(),
    run: vi.fn(),
  }
}

function makeMockCipher() {
  return {
    update: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    final: vi.fn().mockReturnValue(Buffer.alloc(0)),
    getAuthTag: vi.fn().mockReturnValue(randomBytes(16)),
  }
}

// ─── Tests ──────────────────────────────────────────────
describe('SyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDatabase).mockResolvedValue(makeMockDb() as any)
    vi.mocked(splitDerivedKey).mockReturnValue({
      encryptionKey: randomBytes(32),
      hmacKey: randomBytes(32),
    })
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('db-data'))
    vi.mocked(deriveKey).mockResolvedValue(randomBytes(64))
    vi.mocked(createCipheriv).mockReturnValue(makeMockCipher() as any)
  })

  afterEach(async () => {
    try { await disableSync() } catch {}
  })

  // ─── getSyncStatus ──────────────────────────────────────
  describe('getSyncStatus', () => {
    it('should return default status when sync is not configured', async () => {
      await disableSync()
      const status = getSyncStatus()

      expect(status.enabled).toBe(false)
      expect(status.folder).toBeNull()
      expect(status.isSyncing).toBe(false)
    })
  })

  // ─── selectSyncFolder ───────────────────────────────────
  describe('selectSyncFolder', () => {
    it('should return error when no window is available', async () => {
      vi.mocked(getWindow).mockReturnValue(undefined)

      const result = await selectSyncFolder()

      expect(result).toEqual({ success: false, error: 'Нет доступного окна' })
    })

    it('should return success false when dialog is canceled', async () => {
      vi.mocked(getWindow).mockReturnValue({} as any)
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })

      const result = await selectSyncFolder()

      expect(result).toEqual({ success: false })
    })

    it('should save folder to db and enable sync on success', async () => {
      const mockDb = makeMockDb()
      vi.mocked(getDatabase).mockResolvedValue(mockDb as any)
      vi.mocked(getWindow).mockReturnValue({} as any)
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/sync/folder'],
      })
      // Set sync password so exportToSync succeeds
      await setSyncPassword('test-password')

      const result = await selectSyncFolder()

      expect(result).toEqual({ success: true, folder: '/sync/folder' })
      expect(mockDb.run).toHaveBeenCalledWith(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_folder', ?)",
        ['/sync/folder'],
      )
      expect(mockDb.run).toHaveBeenCalledWith(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_enabled', 'true')",
      )
      expect(saveDatabase).toHaveBeenCalled()
    })
  })

  // ─── syncNow ────────────────────────────────────────────
  describe('syncNow', () => {
    it('should return error when sync is not configured', async () => {
      await disableSync()

      const result = await syncNow()

      expect(result).toEqual({ success: false, error: 'Синхронизация не настроена' })
    })

    it('should return success after configuring sync', async () => {
      const mockDb = makeMockDb()
      vi.mocked(getDatabase).mockResolvedValue(mockDb as any)
      vi.mocked(getWindow).mockReturnValue({} as any)
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/sync/folder'],
      })

      await setSyncPassword('test-password')
      await selectSyncFolder()

      // Re-set mocks after selectSyncFolder consumed them
      vi.mocked(readFileSync).mockReturnValue(Buffer.from('db-data'))
      vi.mocked(createCipheriv).mockReturnValue(makeMockCipher() as any)

      const result = await syncNow()

      expect(result).toEqual({ success: true })
      expect(writeFileSync).toHaveBeenCalled()
      expect(renameSync).toHaveBeenCalled()
    })
  })
})
