import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { dialog } from 'electron'
import { getDatabasePath, saveDatabase, resetDatabase } from '../db/connection'
import { deriveKey, splitDerivedKey } from '../crypto/keyderivation'
import { ERRORS } from '../../../shared/errors'
import { CRYPTO } from '../crypto/constants'
import { getWindow } from '../utils/window'

const MAGIC = 'CIPHERVAULT'
const VERSION = 1
// Header: magic(11) + version(1) + salt(32) + iv(12) + authTag(16) = 72 bytes
const HEADER_SIZE = 11 + 1 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE + CRYPTO.AUTH_TAG_SIZE

export async function exportEncryptedBackup(
  backupPassword: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  saveDatabase()

  const dbPath = getDatabasePath()
  const dbBuffer = readFileSync(dbPath)

  const salt = randomBytes(CRYPTO.SALT_SIZE)
  const key = await deriveKey(backupPassword, salt)
  const { encryptionKey } = splitDerivedKey(key)

  const iv = randomBytes(CRYPTO.IV_SIZE)
  const cipher = createCipheriv(CRYPTO.ENCRYPTION_ALGO, encryptionKey, iv, {
    authTagLength: CRYPTO.AUTH_TAG_SIZE,
  })
  const encrypted = Buffer.concat([cipher.update(dbBuffer), cipher.final()])
  const authTag = cipher.getAuthTag()

  const win = getWindow()
  if (!win) return { success: false, error: ERRORS.BACKUP_NO_WINDOW }
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Encrypted Backup',
    defaultPath: 'cipher-vault-backup.ciphervault',
    filters: [{ name: 'CipherVault Backup', extensions: ['ciphervault'] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false }
  }

  const header = Buffer.concat([
    Buffer.from(MAGIC, 'ascii'),
    Buffer.from([VERSION]),
    salt,
    iv,
    authTag,
  ])

  writeFileSync(result.filePath, Buffer.concat([header, encrypted]))
  return { success: true, path: result.filePath }
}

export async function importEncryptedBackup(
  backupPassword: string
): Promise<{ success: boolean; error?: string }> {
  const win = getWindow()
  if (!win) return { success: false, error: ERRORS.BACKUP_NO_WINDOW }
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Encrypted Backup',
    filters: [{ name: 'CipherVault Backup', extensions: ['ciphervault'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) {
    return { success: false }
  }
  const filePath = result.filePaths[0]

  const fileBuffer = readFileSync(filePath)

  if (fileBuffer.length < HEADER_SIZE) {
    return { success: false, error: ERRORS.BACKUP_FILE_TOO_SMALL }
  }

  const magic = fileBuffer.subarray(0, 11).toString('ascii')
  if (magic !== MAGIC) {
    return { success: false, error: ERRORS.BACKUP_BAD_MAGIC }
  }

  const version = fileBuffer[11]
  if (version !== 1) {
    return { success: false, error: ERRORS.BACKUP_UNSUPPORTED_VERSION }
  }

  const salt = fileBuffer.subarray(12, 12 + CRYPTO.SALT_SIZE)
  const iv = fileBuffer.subarray(12 + CRYPTO.SALT_SIZE, 12 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE)
  const authTag = fileBuffer.subarray(
    12 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE,
    12 + CRYPTO.SALT_SIZE + CRYPTO.IV_SIZE + CRYPTO.AUTH_TAG_SIZE
  )
  const encryptedData = fileBuffer.subarray(HEADER_SIZE)

  const key = await deriveKey(backupPassword, salt)
  const { encryptionKey } = splitDerivedKey(key)

  try {
    const decipher = createDecipheriv(CRYPTO.ENCRYPTION_ALGO, encryptionKey, iv, {
      authTagLength: CRYPTO.AUTH_TAG_SIZE,
    })
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])

    const dbPath = getDatabasePath()
    const backupPath = dbPath + '.bak'
    try {
      copyFileSync(dbPath, backupPath)
    } catch {
      // DB file may not exist yet or may be locked — proceed with restore
    }
    writeFileSync(dbPath, decrypted)
    resetDatabase()

    return { success: true }
  } catch {
    return { success: false, error: ERRORS.BACKUP_DECRYPT_FAILED }
  }
}
