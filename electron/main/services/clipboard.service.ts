import { clipboard } from 'electron'
import { DEFAULTS } from '../crypto/constants'
import { writeSecureText } from '../security/windowsClipboard'
import { secureWipe } from '../security/memoryGuard'

let copiedBuffer: Buffer | null = null
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
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }

  if (copiedBuffer) {
    secureWipe(copiedBuffer)
    copiedBuffer = null
  }

  copiedBuffer = Buffer.from(text, 'utf8')
  copiedValue = text
  writeToClipboard(text)

  if (ttl > 0) {
    clearTimer = setTimeout(() => {
      if (clipboard.readText() === copiedValue) {
        clipboard.clear()
      }
      if (copiedBuffer) {
        secureWipe(copiedBuffer)
        copiedBuffer = null
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
  // Always clear OS clipboard on vault lock — don't conditionalize on content match
  clipboard.clear()
  if (copiedBuffer) {
    secureWipe(copiedBuffer)
    copiedBuffer = null
  }
  copiedValue = ''
}
