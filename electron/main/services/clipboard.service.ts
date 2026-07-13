import { clipboard } from 'electron'
import { DEFAULTS } from '../crypto/constants'

let clearTimer: ReturnType<typeof setTimeout> | null = null

export async function copyToClipboard(text: string, ttl: number = DEFAULTS.CLIPBOARD_TTL_MS): Promise<void> {
  // Cancel previous timer
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }

  clipboard.writeText(text)

  if (ttl > 0) {
    clearTimer = setTimeout(() => {
      clipboard.writeText('')
      clearTimer = null
    }, ttl)
  }
}

export function clearClipboard(): void {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  clipboard.writeText('')
}
