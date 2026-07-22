import { safeStorage } from 'electron'
import { getDatabase } from '../db/connection'

// Encrypt a string using OS keychain (safeStorage)
function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain encryption not available')
  }
  return 'enc:' + safeStorage.encryptString(plain).toString('base64')
}

// Decrypt a string stored by encrypt()
function decrypt(stored: string): string {
  if (stored.startsWith('enc:')) {
    const buf = Buffer.from(stored.slice(4), 'base64')
    return safeStorage.decryptString(buf)
  }
  throw new Error('Invalid secret format: expected enc: prefix')
}

export async function saveSecret(key: string, value: string): Promise<void> {
  const db = await getDatabase()
  const encrypted = encrypt(value)
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, encrypted])
}

export async function getSecret(key: string): Promise<string | null> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = ?", [key])
    if (result.length === 0 || result[0].values.length === 0) return null
    const stored = result[0].values[0][0] as string
    return decrypt(stored)
  } catch {
    return null
  }
}

export async function hasSecret(key: string): Promise<boolean> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = ?", [key])
    return result.length > 0 && result[0].values.length > 0
  } catch {
    return false
  }
}
