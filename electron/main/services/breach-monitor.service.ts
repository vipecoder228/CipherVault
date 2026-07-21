import { getDatabase } from '../db/connection'
import { getEntries } from '../db/queries/entries.queries'
import { decryptJSON } from '../crypto/encryption'
import { getEncryptionKey, getActiveVaultId } from './vault.service'
import { checkBreach } from './breach-check.service'
import { sendBreachNotification } from './email.service'

let monitorInterval: ReturnType<typeof setInterval> | null = null
const CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

export async function checkAllPasswordsForBreaches(): Promise<{ checked: number; breached: number }> {
  const encKey = getEncryptionKey()
  if (!encKey) return { checked: 0, breached: 0 }

  const db = await getDatabase()
  const vaultId = getActiveVaultId()
  const entries = getEntries(db, {}, vaultId)

  let checked = 0
  let breached = 0

  for (const entry of entries) {
    try {
      const decrypted = decryptJSON<{ password?: string; title?: string }>(
        { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
        encKey
      )

      if (!decrypted.password) continue

      const result = await checkBreach(decrypted.password)
      checked++

      if (result.breached) {
        breached++
        const title = decrypted.title || entry.display_title
        await sendBreachNotification(title, result.count)
      }
    } catch {}
  }

  return { checked, breached }
}

export function startBreachMonitor(): void {
  if (monitorInterval) return

  // Check immediately on start
  checkAllPasswordsForBreaches().catch(() => {})

  // Then check every 24 hours
  monitorInterval = setInterval(() => {
    checkAllPasswordsForBreaches().catch(() => {})
  }, CHECK_INTERVAL)
}

export function stopBreachMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}
