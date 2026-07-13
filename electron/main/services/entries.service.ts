import { getDatabase, saveDatabase } from '../db/connection'
import {
  getEntries,
  getEntryById,
  createEntry as dbCreateEntry,
  updateEntry as dbUpdateEntry,
  toggleFavorite as dbToggleFavorite,
  deleteEntry as dbDeleteEntry,
  searchEntries as dbSearchEntries,
} from '../db/queries/entries.queries'
import { addHistoryEntry, getEntryHistory, getFullEntryHistory } from '../db/queries/history.queries'
import { encryptJSON, decryptJSON } from '../crypto/encryption'
import { getEncryptionKey } from './vault.service'
import { generateTOTPToken } from '../crypto/totp'
import type { CreateEntryPayload, UpdateEntryPayload, DecryptedEntry, EncryptedEntry, EntryFilters, EntryHistoryItem } from '../../shared/types'

export async function listEntries(filters?: EntryFilters): Promise<EncryptedEntry[]> {
  const db = await getDatabase()
  return getEntries(db, filters)
}

export async function getEntry(id: number): Promise<DecryptedEntry | null> {
  const encKey = getEncryptionKey()
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const row = getEntryById(db, id)
  if (!row) return null

  const decrypted = decryptJSON<DecryptedEntry>(row, encKey)
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
  }

  const encrypted = encryptJSON(entryData, encKey)

  const entry = dbCreateEntry(
    db,
    data.entry_type,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    data.title || data.entry_type,
    data.category_id ?? null,
    data.is_favorite ?? false
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

  const existingData = decryptJSON<Record<string, string>>(existing, encKey)

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
  }

  addHistoryEntry(db, id, existing.encrypted_data, existing.iv, existing.auth_tag, 'update')

  const encrypted = encryptJSON(updatedData, encKey)
  const displayTitle = data.title ?? existing.display_title
  dbUpdateEntry(db, id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, displayTitle)
  saveDatabase()
}

export async function deleteEntryById(id: number): Promise<void> {
  const db = await getDatabase()
  dbDeleteEntry(db, id)
  saveDatabase()
}

export async function searchEntries(query: string): Promise<EncryptedEntry[]> {
  const db = await getDatabase()
  return dbSearchEntries(db, query)
}

export async function toggleFavoriteEntry(id: number): Promise<void> {
  const db = await getDatabase()
  dbToggleFavorite(db, id)
  saveDatabase()
}

export async function getEntryHistoryList(id: number): Promise<EntryHistoryItem[]> {
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
  if (!encKey) throw new Error('Vault is locked')

  const db = await getDatabase()
  const entry = getEntryById(db, id)
  if (!entry) return null

  const decrypted = decryptJSON<Record<string, string>>(entry, encKey)
  if (!decrypted.totp_secret) return null

  try {
    return generateTOTPToken(decrypted.totp_secret)
  } catch {
    return null
  }
}
