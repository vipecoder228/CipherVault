import { clipboard } from 'electron'
import { DEFAULTS } from '../crypto/constants'
import { writeSecureText } from '../security/windowsClipboard'

let copiedValue = ''
let clearTimer: ReturnType<typeof setTimeout> | null = null

function writeToClipboard(text: string): void {
  if (process.platform === 'win32') {
    try {
      writeSecureText(text)
      return
    } catch {
      // Fall through to the regular Electron clipboard write below.
    }
  }
  clipboard.writeText(text)
}

export async function copyToClipboard(text: string, ttl: number = DEFAULTS.CLIPBOARD_TTL_MS): Promise<void> {
  // Cancel previous timer
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }

  copiedValue = text
  writeToClipboard(text)

  if (ttl > 0) {
    clearTimer = setTimeout(() => {
      if (clipboard.readText() === copiedValue) {
        clipboard.clear()
      }
      copiedValue = ''
      clearTimer = null
    }, ttl)
  }
}

export function clearClipboard(): void {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  if (clipboard.readText() === copiedValue) {
    clipboard.clear()
  }
  copiedValue = ''
}
