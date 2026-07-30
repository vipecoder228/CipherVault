import type { TranslationKeys } from '../../i18n'
import { deriveKeyArgon2id32, generateSalt, fromHex } from '../../../shared/crypto/keyderivation'
import { encrypt } from '../../../shared/crypto/encryption'

// Magic prefix identifying the panic-backup outer envelope as Argon2id-derived
// (vs. the legacy PBKDF2 envelope, which has no prefix). Restore code on both
// platforms checks for this before falling back to the legacy PBKDF2 path.
const ENVELOPE_MAGIC = new TextEncoder().encode('CVP2')

export type BackupResult = { emailed?: boolean; filePath?: string; reason?: string } | null

type InvokeFn = (channel: string, ...args: any[]) => Promise<any>

// Duress mode gives no choice: the moment it activates, real data is
// backed up (best-effort) to Telegram and then permanently deleted.
// A missing/failed backup must never block the wipe — losing the backup
// is an acceptable tradeoff, leaving the real data behind under duress is not.
// Extracted from the component so this policy can be unit-tested without
// rendering React (this file has no React/DOM dependency).
export async function runPanicWipe(deps: { invoke: InvokeFn }): Promise<{
  backupResult: BackupResult
  deletedCount: number
}> {
  const { invoke: inv } = deps
  let entries: any[] = []
  try {
    entries = await inv('entries:panic-backup')
  } catch {
    entries = []
  }

  let backupResult: BackupResult = null

  try {
    if (entries && entries.length > 0) {
      const backupPassword = await inv('settings:get-secure', 'panic_backup_password')
      if (backupPassword) {
        const vaultStatus = await inv('vault:status') as { activeVaultId: number }
        const kdfSalt = await inv('vault:get-kdf-salt', vaultStatus.activeVaultId) as string | null

        const backupJson = JSON.stringify({
          format: 'ciphervault-panic-backup',
          version: '2.0',
          timestamp: new Date().toISOString(),
          entryCount: entries.length,
          kdf_salt: kdfSalt,
          entries: entries.map((e) => ({
            id: e.id,
            entry_type: e.entry_type,
            display_title: e.display_title,
            iv: e.iv,
            encrypted_data: e.encrypted_data,
            auth_tag: e.auth_tag,
          })),
        }, null, 2)

        const encrypted = await encryptText(backupJson, backupPassword)
        const sendResult = await inv('email:send-backup', encrypted)
        backupResult = { emailed: sendResult?.sent || false, filePath: sendResult?.filePath, reason: sendResult?.reason }
      }
    }
  } catch (err) {
    console.error('Panic backup failed, deleting data anyway:', err)
  }

  // Delete everything regardless of whether the backup succeeded.
  let deletedCount = 0
  for (const entry of entries) {
    try {
      await inv('entries:force-delete', entry.id)
      deletedCount++
    } catch {
      // Continue deleting other entries
    }
  }

  try {
    await inv('entries:complete-panic')
  } catch {}

  return { backupResult, deletedCount }
}

const BACKUP_REASON_KEYS: Record<string, TranslationKeys> = {
  no_token: 'panic_backup_reason_no_token',
  telegram_rejected: 'panic_backup_reason_telegram_rejected',
  network_error: 'panic_backup_reason_network_error',
  no_telegram_configured: 'panic_backup_reason_not_configured',
  web_download_only: 'panic_backup_reason_web_download_only',
}

export function backupReasonKey(reason: string): TranslationKeys {
  return BACKUP_REASON_KEYS[reason] || 'panic_backup_reason_unknown'
}

// AES-GCM encryption using the shared Argon2id KDF helper, so the panic backup
// envelope uses the same key derivation as the rest of the app instead of a
// separate inline PBKDF2 path. Layout: MAGIC(4) + salt(32) + iv(12) + ciphertext+authTag.
// The MAGIC prefix lets the restore path (backup:import-panic) tell this apart
// from older backups, which have no prefix and were encrypted with PBKDF2.
export async function encryptText(text: string, password: string): Promise<string> {
  const salt = generateSalt()
  const encryptionKey = await deriveKeyArgon2id32(password, salt)
  const payload = await encrypt(text, encryptionKey)

  const ivBytes = fromHex(payload.iv)
  const ciphertextBytes = fromHex(payload.ciphertext)
  const authTagBytes = fromHex(payload.authTag)

  const combined = new Uint8Array(
    ENVELOPE_MAGIC.length + salt.length + ivBytes.length + ciphertextBytes.length + authTagBytes.length
  )
  let offset = 0
  combined.set(ENVELOPE_MAGIC, offset); offset += ENVELOPE_MAGIC.length
  combined.set(salt, offset); offset += salt.length
  combined.set(ivBytes, offset); offset += ivBytes.length
  combined.set(ciphertextBytes, offset); offset += ciphertextBytes.length
  combined.set(authTagBytes, offset)

  return btoa(Array.from(combined, b => String.fromCharCode(b)).join(''))
}
