import { getDatabase } from '../db/connection'
import { getEntries } from '../db/queries/entries.queries'
import { decryptJSON } from '../crypto/encryption'
import { getEncryptionKey, getActiveVaultId } from './vault.service'

export interface PasswordHealth {
  total: number
  weak: number
  reused: number
  old: number
  exposed: number
  score: number // 0-100
  details: PasswordHealthItem[]
}

export interface PasswordHealthItem {
  entryId: number
  title: string
  issues: string[]
}

export async function analyzePasswordHealth(): Promise<PasswordHealth> {
  const encKey = getEncryptionKey()
  if (!encKey) return { total: 0, weak: 0, reused: 0, old: 0, exposed: 0, score: 100, details: [] }

  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  const entries = getEntries(db, {}, vaultId)

  const details: PasswordHealthItem[] = []
  const passwordMap = new Map<string, number[]>() // password -> entry IDs
  let weak = 0
  let reused = 0
  let old = 0

  for (const entry of entries) {
    try {
      const decrypted = decryptJSON<{ password?: string; title?: string }>(
        { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
        encKey
      )

      if (!decrypted.password) continue

      const pwd = decrypted.password
      const title = decrypted.title || entry.display_title
      const issues: string[] = []

      // Check strength
      if (pwd.length < 12) {
        issues.push('Too short (less than 12 characters)')
        weak++
      }
      if (!/[A-Z]/.test(pwd)) {
        issues.push('Missing uppercase letters')
      }
      if (!/[a-z]/.test(pwd)) {
        issues.push('Missing lowercase letters')
      }
      if (!/[0-9]/.test(pwd)) {
        issues.push('Missing numbers')
      }
      if (!/[^a-zA-Z0-9]/.test(pwd)) {
        issues.push('Missing special characters')
      }

      // Track for reuse detection
      const existing = passwordMap.get(pwd) || []
      existing.push(entry.id)
      passwordMap.set(pwd, existing)

      // Check age (entries updated more than 180 days ago)
      const updated = new Date(entry.updated_at)
      const daysSinceUpdate = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUpdate > 180) {
        issues.push(`Not updated in ${Math.floor(daysSinceUpdate)} days`)
        old++
      }

      if (issues.length > 0) {
        details.push({ entryId: entry.id, title, issues })
      }
    } catch {
      // skip corrupted entries
    }
  }

  // Find reused passwords
  for (const [pwd, ids] of passwordMap) {
    if (ids.length > 1) {
      reused += ids.length
      for (const id of ids) {
        const item = details.find(d => d.entryId === id)
        if (item) {
          item.issues.push(`Reused in ${ids.length} entries`)
        } else {
          const entry = entries.find(e => e.id === id)
          if (entry) {
            details.push({
              entryId: id,
              title: entry.display_title,
              issues: [`Reused in ${ids.length} entries`],
            })
          }
        }
      }
    }
  }

  const total = entries.length
  const score = total === 0 ? 100 : Math.max(0, Math.round(100 - (details.length / total) * 100))

  return { total, weak, reused, old, exposed: 0, score, details }
}
