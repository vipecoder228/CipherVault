// Encrypt/decrypt sensitive credentials using vault encryption key
import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { getEncryptionKey } from './vault.service'

/**
 * Encrypt a credential string using the vault encryption key.
 * Returns a JSON string with iv, ciphertext, and authTag.
 */
export function encryptCredential(plaintext: string): string {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')
  const result = encryptJSON({ value: plaintext }, encKey)
  return JSON.stringify(result)
}

/**
 * Decrypt a credential string that was encrypted with encryptCredential.
 */
export function decryptCredential(encrypted: string): string {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')
  const parsed = JSON.parse(encrypted)
  const result = decryptJSON<{ value: string }>(
    { iv: parsed.iv, ciphertext: parsed.ciphertext, authTag: parsed.authTag },
    encKey
  )
  return result.value
}
