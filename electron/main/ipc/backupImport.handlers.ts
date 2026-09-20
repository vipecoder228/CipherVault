import { dialog } from 'electron'
import { readFileSync } from 'fs'
import { ERRORS } from '../../../shared/errors'
import * as entriesService from '../services/entries.service'
import { getWindow } from '../utils/window'

export async function handleImportPanicBackup(backupPassword: string, masterPassword?: string) {
  const win = getWindow()
  if (!win) return { success: false, error: ERRORS.BACKUP_NO_WINDOW }

  const result = await dialog.showOpenDialog(win, {
    title: 'Import Panic Backup',
    filters: [{ name: 'Encrypted Backup', extensions: ['enc'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) {
    return { success: false, error: ERRORS.BACKUP_CANCELLED }
  }
  const filePath = result.filePaths[0]

  try {
    const { pbkdf2, createDecipheriv } = await import('crypto')
    const { deriveKey, splitDerivedKey } = await import('../crypto/keyderivation')
    const { decryptJSON } = await import('../crypto/encryption')

    const fileContent = readFileSync(filePath, 'utf-8').trim()
    const raw = Buffer.from(fileContent, 'base64')

    const magic = Buffer.from('CVP2', 'utf-8')
    const isArgon2Envelope = raw.subarray(0, 4).equals(magic)
    const combined = isArgon2Envelope ? raw.subarray(4) : raw

    const salt = combined.subarray(0, 32)
    const iv = combined.subarray(32, 44)
    const encryptedData = combined.subarray(44)

    const key = isArgon2Envelope
      ? (await deriveKey(backupPassword, salt))
      : await new Promise<Buffer>((resolve, reject) => {
          pbkdf2(backupPassword, salt, 600000, 32, 'sha256', (err, derivedKey) => {
            if (err) reject(err)
            else resolve(derivedKey)
          })
        })
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    decipher.setAuthTag(encryptedData.subarray(encryptedData.length - 16))
    const decrypted = Buffer.concat([
      decipher.update(encryptedData.subarray(0, encryptedData.length - 16)),
      decipher.final(),
    ]).toString('utf-8')

    const backup = JSON.parse(decrypted)
    if (backup.format !== 'ciphervault-panic-backup') {
      return { success: false, error: ERRORS.BACKUP_FORMAT_INVALID }
    }

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    if (backup.version === '2.0') {
      if (!masterPassword) {
        return { success: false, error: 'Мастер-пароль необходим для восстановления зашифрованных записей' }
      }
      if (!backup.kdf_salt) {
        return { success: false, error: 'Бэкап не содержит kdf_salt. Невозможно восстановить записи.' }
      }

      const originalSalt = Buffer.from(backup.kdf_salt, 'hex')
      const originalKey = await deriveKey(masterPassword, originalSalt)
      const { encryptionKey: originalEncKey } = splitDerivedKey(originalKey)

      for (const entry of backup.entries) {
        try {
          if (!entry.display_title) { skipped++; continue }

          const decryptedEntry = decryptJSON<Record<string, string>>(
            { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
            originalEncKey
          )

          await entriesService.createEntry({
            entry_type: entry.entry_type || 'login',
            title: entry.display_title || '',
            username: decryptedEntry.username || '',
            password: decryptedEntry.password || '',
            url: decryptedEntry.url || '',
            notes: decryptedEntry.notes || '',
            totp_secret: decryptedEntry.totp_secret || '',
            card_number: decryptedEntry.card_number || undefined,
            card_holder: decryptedEntry.card_holder || undefined,
            card_expiry: decryptedEntry.card_expiry || undefined,
            card_cvv: decryptedEntry.card_cvv || undefined,
            identity_first_name: decryptedEntry.identity_first_name || undefined,
            identity_last_name: decryptedEntry.identity_last_name || undefined,
            identity_phone: decryptedEntry.identity_phone || undefined,
            identity_email: decryptedEntry.identity_email || undefined,
            identity_address: decryptedEntry.identity_address || undefined,
            identity_ssn: decryptedEntry.identity_ssn || undefined,
            identity_passport: decryptedEntry.identity_passport || undefined,
            identity_birthdate: decryptedEntry.identity_birthdate || undefined,
          })
          imported++
        } catch (e: any) {
          errors.push(`Entry: ${e.message}`)
          skipped++
        }
      }
    } else {
      for (const entry of backup.entries || []) {
        try {
          if (!entry.display_title) { skipped++; continue }

          await entriesService.createEntry({
            entry_type: entry.entry_type || 'login',
            title: entry.display_title || '',
            username: entry.username || '',
            password: entry.password || '',
            url: entry.url || '',
            notes: entry.notes || '',
            totp_secret: entry.totp_secret || '',
            card_number: entry.card_number || undefined,
            card_holder: entry.card_holder || undefined,
            card_expiry: entry.card_expiry || undefined,
            card_cvv: entry.card_cvv || undefined,
            identity_first_name: entry.identity_first_name || undefined,
            identity_last_name: entry.identity_last_name || undefined,
            identity_phone: entry.identity_phone || undefined,
            identity_email: entry.identity_email || undefined,
            identity_address: entry.identity_address || undefined,
            identity_ssn: entry.identity_ssn || undefined,
            identity_passport: entry.identity_passport || undefined,
            identity_birthdate: entry.identity_birthdate || undefined,
          })
          imported++
        } catch (e: any) {
          errors.push(`Entry: ${e.message}`)
          skipped++
        }
      }
    }

    return { success: true, imported, skipped, errors }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
