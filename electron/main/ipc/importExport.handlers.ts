import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import * as entriesService from '../services/entries.service'
import { getActiveVaultId } from '../services/vault.service'
import { getWindow } from '../utils/window'
import { mapColumns, mapEntryType, detectCSVSource } from '../../../shared/importMapper'
import { getDatabase } from '../db/connection'

function stripQuotes(s: string): string {
  return (s || '').replace(/^"(.*)"$/, '$1')
}

function escapeCSV(value: string): string {
  return value.replace(/"/g, '""')
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

async function isDuplicateEntry(title: string, username: string, vaultId?: number): Promise<boolean> {
  try {
    const db = await getDatabase()
    const vid = vaultId ?? getActiveVaultId()
    const result = db.exec(
      "SELECT COUNT(*) as cnt FROM encrypted_entries WHERE display_title = ? AND username = ? AND vault_id = ? AND deleted_at IS NULL",
      [title, username, vid]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      return (result[0].values[0][0] as number) > 0
    }
  } catch {}
  return false
}

export async function handleImportCSV(): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const win = getWindow()
  if (!win) return { imported: 0, skipped: 0, errors: ['No window available'] }
  const openResult = await dialog.showOpenDialog(win, {
    title: 'Import CSV',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    properties: ['openFile'],
  })
  if (openResult.canceled || !openResult.filePaths[0]) {
    return { imported: 0, skipped: 0, errors: ['Cancelled'] }
  }
  const filePath = openResult.filePaths[0]

  try {
    let content = readFileSync(filePath, 'utf-8')
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1)
    }
    const lines: string[] = []
    let currentLine = ''
    let inQuotes = false
    for (const char of content) {
      if (char === '"') {
        inQuotes = !inQuotes
        currentLine += char
      } else if (char === '\r') {
      } else if (char === '\n' && !inQuotes) {
        if (currentLine.trim()) {
          lines.push(currentLine)
        }
        currentLine = ''
      } else {
        currentLine += char
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine)
    }
    const headerLine = lines[0]
    const colMap = mapColumns(headerLine)
    const source = detectCSVSource(headerLine)
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const vaultId = getActiveVaultId()

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i])
        const title = colMap.nameIdx >= 0 ? stripQuotes(values[colMap.nameIdx]) : `Import ${i}`
        if (!title) { skipped++; continue }

        const entryType = mapEntryType(
          colMap.typeIdx >= 0 ? values[colMap.typeIdx] : '',
          source
        )

        if (await isDuplicateEntry(title, colMap.userIdx >= 0 ? values[colMap.userIdx] : '', vaultId)) {
          skipped++
          continue
        }

        await entriesService.createEntry({
          entry_type: entryType as any,
          title,
          username: stripQuotes(colMap.userIdx >= 0 ? values[colMap.userIdx] : ''),
          password: stripQuotes(colMap.passIdx >= 0 ? values[colMap.passIdx] : ''),
          url: stripQuotes(colMap.urlIdx >= 0 ? values[colMap.urlIdx] : ''),
          notes: stripQuotes(colMap.notesIdx >= 0 ? values[colMap.notesIdx] : ''),
          totp_secret: stripQuotes(colMap.totpIdx >= 0 ? values[colMap.totpIdx] : ''),
          card_number: colMap.cardNumIdx >= 0 ? stripQuotes(values[colMap.cardNumIdx]) : undefined,
          card_holder: colMap.cardHolderIdx >= 0 ? stripQuotes(values[colMap.cardHolderIdx]) : undefined,
          card_expiry: colMap.cardExpiryIdx >= 0 ? stripQuotes(values[colMap.cardExpiryIdx]) : undefined,
          card_cvv: colMap.cardCvvIdx >= 0 ? stripQuotes(values[colMap.cardCvvIdx]) : undefined,
          identity_first_name: colMap.firstNameIdx >= 0 ? stripQuotes(values[colMap.firstNameIdx]) : undefined,
          identity_last_name: colMap.lastNameIdx >= 0 ? stripQuotes(values[colMap.lastNameIdx]) : undefined,
          identity_phone: colMap.phoneIdx >= 0 ? stripQuotes(values[colMap.phoneIdx]) : undefined,
          identity_email: colMap.emailIdx >= 0 ? stripQuotes(values[colMap.emailIdx]) : undefined,
          identity_address: colMap.addressIdx >= 0 ? stripQuotes(values[colMap.addressIdx]) : undefined,
        })
        imported++
      } catch (e: any) {
        errors.push(`Row ${i}: ${e.message}`)
        skipped++
      }
    }

    return { imported, skipped, errors }
  } catch (e: any) {
    return { imported: 0, skipped: 0, errors: [e.message] }
  }
}

export async function handleImportJSON(): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const win = getWindow()
  if (!win) return { imported: 0, skipped: 0, errors: ['No window available'] }
  const openResult = await dialog.showOpenDialog(win, {
    title: 'Import JSON',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (openResult.canceled || !openResult.filePaths[0]) {
    return { imported: 0, skipped: 0, errors: ['Cancelled'] }
  }
  const filePath = openResult.filePaths[0]

  try {
    const content = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    const items = Array.isArray(data) ? data : data.items || data.entries || []
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const vaultId = getActiveVaultId()

    const bwTypeMap: Record<number, string> = {
      1: 'login', 2: 'secure_note', 3: 'card', 4: 'identity',
      5: 'login', 6: 'login', 7: 'login',
    }

    for (const item of items) {
      try {
        const title = item.title || item.name || item.Name || ''
        if (!title) { skipped++; continue }

        const login = item.login || item.Login || {}
        const username = item.username || item.user || login.username || login.Username || ''
        const password = item.password || item.Password || login.password || login.Password || ''

        let url = ''
        if (item.url) url = item.url
        else if (item.Url) url = item.Url
        else if (login.uris && Array.isArray(login.uris) && login.uris.length > 0)
          url = login.uris[0].uri || login.uris[0].Uri || ''
        else if (login.Uri) url = login.Uri

        const totp = login.totp || login.TOTP || item.totp || ''

        let entryType: string
        if (typeof item.type === 'number') entryType = bwTypeMap[item.type] || 'login'
        else if (typeof item.Type === 'number') entryType = bwTypeMap[item.Type] || 'login'
        else entryType = item.type || item.Type || 'login'

        const VALID_ENTRY_TYPES = ['login', 'secure_note', 'card', 'identity', 'passkey']
        if (!VALID_ENTRY_TYPES.includes(entryType)) entryType = 'login'

        const notes = item.notes || item.Notes || item.note || ''

        const card = item.card || item.Card || {}
        const identity = item.identity || item.Identity || {}

        if (await isDuplicateEntry(title, username, vaultId)) {
          skipped++
          continue
        }

        await entriesService.createEntry({
          entry_type: entryType as any,
          title,
          username: String(username),
          password: String(password),
          url: String(url),
          notes: String(notes),
          totp_secret: totp ? String(totp) : undefined,
          card_number: card.number || card.Number ? String(card.number || card.Number) : undefined,
          card_holder: card.cardholderName || card.CardholderName ? String(card.cardholderName || card.CardholderName) : undefined,
          card_expiry: (card.expMonth && card.expYear) ? `${card.expMonth}/${card.expYear}` : (card.expirationDate || ''),
          card_cvv: card.code || card.CVV ? String(card.code || card.CVV) : undefined,
          identity_first_name: identity.firstName || identity.FirstName ? String(identity.firstName || identity.FirstName) : undefined,
          identity_last_name: identity.lastName || identity.LastName ? String(identity.lastName || identity.LastName) : undefined,
          identity_phone: identity.phone || identity.Phone ? String(identity.phone || identity.Phone) : undefined,
          identity_email: identity.email || identity.Email ? String(identity.email || identity.Email) : undefined,
          identity_address: identity.address1 || identity.Address1 ? String(identity.address1 || identity.Address1) : undefined,
          identity_ssn: identity.ssn || identity.SSN ? String(identity.ssn || identity.SSN) : undefined,
          identity_passport: identity.passportNumber || identity.PassportNumber ? String(identity.passportNumber || identity.PassportNumber) : undefined,
          identity_birthdate: identity.birthDate || identity.BirthDate ? String(identity.birthDate || identity.BirthDate) : undefined,
        })
        imported++
      } catch (e: any) {
        errors.push(`Item: ${e.message}`)
        skipped++
      }
    }

    return { imported, skipped, errors }
  } catch (e: any) {
    return { imported: 0, skipped: 0, errors: [e.message] }
  }
}

export async function handleExportCSV(entryIds?: number[]): Promise<{ success: boolean }> {
  const win = getWindow()
  if (!win) return { success: false }
  const saveResult = await dialog.showSaveDialog(win, {
    title: 'Export CSV',
    defaultPath: 'vault-export.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  })
  if (saveResult.canceled || !saveResult.filePath) return { success: false }
  const filePath = saveResult.filePath

  const entries = entryIds
    ? (await Promise.allSettled(entryIds.map(id => entriesService.getEntry(id))))
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value)
    : (await entriesService.listEntries()).map(e => ({ ...e } as any))

  const csvLines = ['name,url,username,password,notes,type,card_number,card_holder,card_expiry,card_cvv']
  for (const entry of entries) {
    if (!entry) continue
    const e = entry as any
    const title = e.display_title || e.title || ''
    const username = e.username || ''
    const password = e.password || ''
    const url = e.url || e.display_url || ''
    const notes = (e.notes || '').replace(/\n/g, ' ')
    const type = e.entry_type || 'login'
    const cardNumber = e.card_number || ''
    const cardHolder = e.card_holder || ''
    const cardExpiry = e.card_expiry || ''
    const cardCvv = e.card_cvv || ''
    csvLines.push(`"${escapeCSV(title)}","${escapeCSV(url)}","${escapeCSV(username)}","${escapeCSV(password)}","${escapeCSV(notes)}","${type}","${escapeCSV(cardNumber)}","${escapeCSV(cardHolder)}","${escapeCSV(cardExpiry)}","${escapeCSV(cardCvv)}"`)
  }

  writeFileSync(filePath, csvLines.join('\n'), 'utf-8')
  return { success: true }
}

export async function handleExportJSON(entryIds?: number[]): Promise<{ success: boolean }> {
  const win = getWindow()
  if (!win) return { success: false }
  const saveResult = await dialog.showSaveDialog(win, {
    title: 'Export JSON',
    defaultPath: 'vault-export.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  })
  if (saveResult.canceled || !saveResult.filePath) return { success: false }
  const filePath = saveResult.filePath

  const entries = entryIds
    ? (await Promise.allSettled(entryIds.map(id => entriesService.getEntry(id))))
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value)
    : (await entriesService.listEntries()).map(e => ({ ...e } as any))

  const data = entries.filter(Boolean).map((entry: any) => ({
    title: entry.display_title || entry.title || '',
    username: entry.username || '',
    password: entry.password || '',
    url: entry.url || entry.display_url || '',
    notes: entry.notes || '',
    type: entry.entry_type || 'login',
    card_number: entry.card_number || '',
    card_holder: entry.card_holder || '',
    card_expiry: entry.card_expiry || '',
    card_cvv: entry.card_cvv || '',
  }))

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return { success: true }
}

export async function handleCheckDuplicatePassword(password: string): Promise<{ duplicated: boolean; count: number; titles: string[] }> {
  if (typeof password !== 'string' || password.length === 0 || password.length > 10_000) {
    return { duplicated: false, count: 0, titles: [] }
  }

  const { getEncryptionKey } = await import('../services/vault.service')
  const { decryptJSON } = await import('../crypto/encryption')
  const { timingSafeEqual } = await import('crypto')
  const encKey = getEncryptionKey()
  if (!encKey) return { duplicated: false, count: 0, titles: [] }

  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  const result = db.exec(
    'SELECT id, display_title, encrypted_data, iv, auth_tag FROM encrypted_entries WHERE vault_id = ? AND deleted_at IS NULL',
    [vaultId]
  )
  if (result.length === 0) return { duplicated: false, count: 0, titles: [] }

  const passwordBuf = Buffer.from(password, 'utf-8')
  const titles: string[] = []
  for (const row of result[0].values) {
    try {
      const decrypted = decryptJSON<Record<string, string>>(
        { iv: row[2] as string, ciphertext: row[3] as string, authTag: row[4] as string },
        encKey
      )
      const candidate = decrypted.password
      if (typeof candidate !== 'string') continue
      const candidateBuf = Buffer.from(candidate, 'utf-8')
      // Constant-time comparison to avoid leaking password length/content via
      // timing (this handler is called on every keystroke with attacker-
      // controlled input if a malicious extension can reach the IPC channel).
      const isMatch = candidateBuf.length === passwordBuf.length && timingSafeEqual(candidateBuf, passwordBuf)
      if (isMatch) {
        titles.push(row[1] as string)
      }
    } catch {}
  }

  return { duplicated: titles.length > 0, count: titles.length, titles }
}
