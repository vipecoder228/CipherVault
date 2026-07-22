// Encrypt/decrypt display metadata (title, URL) using vault encryption key
// This protects metadata from being read without the master password

import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { getEncryptionKey } from './vault.service'

/**
 * Encrypt a display string (title or URL) using the vault encryption key.
 * Returns null if vault is locked or input is empty.
 */
export function encryptMetadata(plaintext: string): string | null {
  if (!plaintext) return ''
  const encKey = getEncryptionKey()
  if (!encKey) return null
  try {
    const result = encryptJSON({ value: plaintext }, encKey)
    return JSON.stringify(result)
  } catch {
    return null
  }
}

/**
 * Decrypt a display string that was encrypted with encryptMetadata.
 * Falls back to the raw value if it's not encrypted (legacy plaintext).
 */
export function decryptMetadata(encrypted: string): string {
  if (!encrypted) return ''
  const encKey = getEncryptionKey()
  if (!encKey) return encrypted // Vault locked — return as-is

  // Check if it's encrypted (JSON with iv/ciphertext/authTag)
  try {
    const parsed = JSON.parse(encrypted)
    if (parsed && typeof parsed === 'object' && 'iv' in parsed && 'ciphertext' in parsed && 'authTag' in parsed) {
      const result = decryptJSON<{ value: string }>(
        { iv: parsed.iv, ciphertext: parsed.ciphertext, authTag: parsed.authTag },
        encKey
      )
      return result.value
    }
  } catch {
    // Not JSON — treat as legacy plaintext
  }

  return encrypted
}

/**
 * Check if a string is encrypted metadata (vs legacy plaintext).
 */
export function isEncryptedMetadata(value: string): boolean {
  if (!value) return false
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && 'iv' in parsed && 'ciphertext' in parsed && 'authTag' in parsed
  } catch {
    return false
  }
}
