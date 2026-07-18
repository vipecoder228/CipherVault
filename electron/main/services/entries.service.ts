import { getDatabase, saveDatabase } from '../db/connection'
import {
  getEntries,
  getEntryById,
  getDeletedEntries as dbGetDeletedEntries,
  createEntry as dbCreateEntry,
  updateEntry as dbUpdateEntry,
  toggleFavorite as dbToggleFavorite,
  deleteEntry as dbDeleteEntry,
  restoreEntry as dbRestoreEntry,
  permanentDeleteEntry as dbPermanentDeleteEntry,
  permanentDeleteOldEntries as dbPermanentDeleteOldEntries,
  searchEntries as dbSearchEntries,
} from '../db/queries/entries.queries'
import { addHistoryEntry, getEntryHistory, getFullEntryHistory } from '../db/queries/history.queries'
import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { getEncryptionKey, getActiveVaultId, getPanicEncryptionKey, clearPanicKey } from './vault.service'
import { generateTOTPToken } from '../crypto/totp'
import type { CreateEntryPayload, UpdateEntryPayload, DecryptedEntry, EncryptedEntry, EntryFilters, EntryHistoryItem } from '../../../shared/types'

export async function listEntries(filters?: EntryFilters): Promise<EncryptedEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return [] // Alarm mode — return empty
  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  return getEntries(db, filters, vaultId)
}

export async function getEntry(id: number): Promise<DecryptedEntry | null> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const row = getEntryById(db, id)
  if (!row) return null

  const decrypted = decryptJSON<DecryptedEntry>(
    { iv: row.iv, ciphertext: row.encrypted_data, authTag: row.auth_tag },
    encKey
  )
  decrypted.id = row.id
  decrypted.display_title = row.display_title
  decrypted.created_at = row.created_at
  decrypted.updated_at = row.updated_at

  return decrypted
}

export async function createEntry(data: CreateEntryPayload): Promise<EncryptedEntry> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()

  const entryData = {
    title: data.title || '',
    username: data.username || '',
    password: data.password || '',
    url: data.url || '',
    notes: data.notes || '',
    totp_secret: data.totp_secret || '',
    card_number: data.card_number || '',
    card_holder: data.card_holder || '',
    card_expiry: data.card_expiry || '',
    card_cvv: data.card_cvv || '',
    identity_first_name: data.identity_first_name || '',
    identity_last_name: data.identity_last_name || '',
    identity_phone: data.identity_phone || '',
    identity_email: data.identity_email || '',
    identity_address: data.identity_address || '',
    identity_ssn: data.identity_ssn || '',
    identity_passport: data.identity_passport || '',
    identity_birthdate: data.identity_birthdate || '',
  }

  const encrypted = encryptJSON(entryData, encKey)

  const vaultId = getActiveVaultId()
  const entry = dbCreateEntry(
    db,
    data.entry_type,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    data.title || data.entry_type,
    data.category_id ?? null,
    data.is_favorite ?? false,
    vaultId
  )

  addHistoryEntry(db, entry.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, 'create')
  saveDatabase()

  return entry
}

export async function updateEntry(id: number, data: UpdateEntryPayload): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const existing = getEntryById(db, id)
  if (!existing) throw new Error('Entry not found')

  const existingData = decryptJSON<Record<string, string>>(
    { iv: existing.iv, ciphertext: existing.encrypted_data, authTag: existing.auth_tag },
    encKey
  )

  const updatedData = {
    title: data.title ?? existingData.title,
    username: data.username ?? existingData.username,
    password: data.password ?? existingData.password,
    url: data.url ?? existingData.url,
    notes: data.notes ?? existingData.notes,
    totp_secret: data.totp_secret ?? existingData.totp_secret,
    card_number: data.card_number ?? existingData.card_number,
    card_holder: data.card_holder ?? existingData.card_holder,
    card_expiry: data.card_expiry ?? existingData.card_expiry,
    card_cvv: data.card_cvv ?? existingData.card_cvv,
    identity_first_name: data.identity_first_name ?? existingData.identity_first_name,
    identity_last_name: data.identity_last_name ?? existingData.identity_last_name,
    identity_phone: data.identity_phone ?? existingData.identity_phone,
    identity_email: data.identity_email ?? existingData.identity_email,
    identity_address: data.identity_address ?? existingData.identity_address,
    identity_ssn: data.identity_ssn ?? existingData.identity_ssn,
    identity_passport: data.identity_passport ?? existingData.identity_passport,
    identity_birthdate: data.identity_birthdate ?? existingData.identity_birthdate,
  }

  addHistoryEntry(db, id, existing.encrypted_data, existing.iv, existing.auth_tag, 'update')

  const encrypted = encryptJSON(updatedData, encKey)
  const displayTitle = data.title ?? existing.display_title
  dbUpdateEntry(db, id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, displayTitle)
  saveDatabase()
}

export async function deleteEntryById(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return // Alarm mode — no-op
  const db = await getDatabase()
  dbDeleteEntry(db, id)
  saveDatabase()
}

export async function restoreEntry(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return
  const db = await getDatabase()
  dbRestoreEntry(db, id)
  saveDatabase()
}

export async function permanentDeleteEntry(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return
  const db = await getDatabase()
  dbPermanentDeleteEntry(db, id)
  saveDatabase()
}

export async function getDeletedEntries(): Promise<EncryptedEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return []
  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  return dbGetDeletedEntries(db, vaultId)
}

export async function cleanupOldDeletedEntries(): Promise<number> {
  const encKey = getEncryptionKey()
  if (!encKey) return 0
  const db = await getDatabase()
  const deleted = dbPermanentDeleteOldEntries(db, 30)
  if (deleted > 0) saveDatabase()
  return deleted
}

export async function searchEntries(query: string, filters?: EntryFilters): Promise<EncryptedEntry[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return [] // Alarm mode — return empty
  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  return dbSearchEntries(db, query, vaultId, filters)
}

export async function toggleFavoriteEntry(id: number): Promise<void> {
  const encKey = getEncryptionKey()
  if (!encKey) return // Alarm mode — no-op
  const db = await getDatabase()
  dbToggleFavorite(db, id)
  saveDatabase()
}

// ─── Alarm Mode — bypass encryption key check ───────────

export async function forceListEntries(): Promise<EncryptedEntry[]> {
  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  return getEntries(db, {}, vaultId)
}

export async function forcePermanentDeleteEntry(id: number): Promise<void> {
  const db = await getDatabase()
  dbPermanentDeleteEntry(db, id)
  saveDatabase()
}

export async function getPanicBackupEntries(): Promise<Array<EncryptedEntry & { decrypted?: Record<string, string> }>> {
  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  const entries = getEntries(db, {}, vaultId)

  // Try to decrypt entries with panic key
  const panicKey = getPanicEncryptionKey()
  if (!panicKey) return entries

  return entries.map((entry) => {
    let decrypted: Record<string, string> | undefined
    try {
      decrypted = decryptJSON<Record<string, string>>(
        { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
        panicKey
      )
    } catch {
      // Decryption failed — return encrypted entry
    }
    return { ...entry, decrypted }
  })
}

export function completePanic(): void {
  clearPanicKey()
}

export async function getEntryHistoryList(id: number): Promise<EntryHistoryItem[]> {
  const encKey = getEncryptionKey()
  if (!encKey) return [] // Alarm mode — return empty
  const db = await getDatabase()
  return getEntryHistory(db, id)
}

export async function getDecryptedHistory(id: number): Promise<Array<EntryHistoryItem & { decrypted: Record<string, string> | null }>> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const rows = getFullEntryHistory(db, id)

  return rows.map((row) => {
    let decrypted: Record<string, string> | null = null
    try {
      decrypted = decryptJSON<Record<string, string>>(
        { iv: row.iv, ciphertext: row.encrypted_snapshot, authTag: row.auth_tag },
        encKey
      )
    } catch {
      // Decryption failed
    }
    return {
      id: row.id,
      entry_id: row.entry_id,
      change_type: row.change_type as 'create' | 'update' | 'delete',
      changed_at: row.changed_at,
      decrypted,
    }
  })
}

export async function getEntryTOTP(id: number): Promise<string | null> {
  const encKey = getEncryptionKey()
  if (!encKey) return null

  const db = await getDatabase()
  const entry = getEntryById(db, id)
  if (!entry) return null

  const decrypted = decryptJSON<Record<string, string>>(
    { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
    encKey
  )
  if (!decrypted.totp_secret) return null

  try {
    return generateTOTPToken(decrypted.totp_secret)
  } catch {
    return null
  }
}

// ─── Browser Extension Support ──────────────────────────

function matchDomain(storedUrl: string, currentDomain: string): boolean {
  if (!storedUrl) return false
  try {
    const stored = new URL(storedUrl)
    return stored.hostname === currentDomain || stored.hostname.endsWith('.' + currentDomain)
  } catch {
    const storedLower = storedUrl.toLowerCase()
    const domainLower = currentDomain.toLowerCase()
    return storedLower === domainLower || storedLower.endsWith('.' + domainLower)
  }
}

export async function searchEntriesByDomain(
  domain: string
): Promise<Array<{ id: number; title: string; username: string }>> {
  const encKey = getEncryptionKey()
  if (!encKey) return []

  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  const rows = getEntries(db, {}, vaultId)

  const matches: Array<{ id: number; title: string; username: string }> = []

  for (const row of rows) {
    try {
      const decrypted = decryptJSON<{ url?: string; username?: string }>(
        { iv: row.iv, ciphertext: row.encrypted_data, authTag: row.auth_tag },
        encKey
      )
      if (matchDomain(decrypted.url || '', domain)) {
        matches.push({
          id: row.id,
          title: row.display_title,
          username: decrypted.username || '',
        })
      }
    } catch {
      // skip corrupted entries
    }
  }

  return matches
}

export async function getEntryCredentials(
  id: number
): Promise<{ id: number; title: string; username: string; password: string } | null> {
  const encKey = getEncryptionKey()
  if (!encKey) return null

  const db = await getDatabase()
  const row = getEntryById(db, id)
  if (!row) return null

  try {
    const decrypted = decryptJSON<{ username?: string; password?: string }>(
      { iv: row.iv, ciphertext: row.encrypted_data, authTag: row.auth_tag },
      encKey
    )
    return {
      id: row.id,
      title: row.display_title,
      username: decrypted.username || '',
      password: decrypted.password || '',
    }
  } catch {
    return null
  }
}
