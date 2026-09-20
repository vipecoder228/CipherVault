import { globalShortcut } from 'electron'
import { ERRORS } from '../../../shared/errors'
import { getDatabase } from '../db/connection'
import { toggleWindow } from '../utils/window'

let currentShortcut: string = 'CommandOrControl+Shift+Space'

export async function loadGlobalShortcut(): Promise<void> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = 'global_shortcut'")
    if (result.length > 0 && result[0].values.length > 0) {
      currentShortcut = result[0].values[0][0] as string
    }
  } catch {}
}

export function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  const registered = globalShortcut.register(currentShortcut, () => {
    toggleWindow()
  })
  if (!registered) {
    console.warn(`Failed to register global shortcut: ${currentShortcut}`)
  }
}

export async function setGlobalShortcut(shortcut: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!shortcut || !shortcut.includes('+')) {
      return { success: false, error: ERRORS.SHORTCUT_INVALID_FORMAT }
    }
    globalShortcut.unregisterAll()
    const registered = globalShortcut.register(shortcut, () => {
      toggleWindow()
    })
    if (!registered) {
      globalShortcut.register(currentShortcut, () => {
        toggleWindow()
      })
      return { success: false, error: ERRORS.SHORTCUT_REGISTER_FAILED }
    }
    currentShortcut = shortcut
    const db = await getDatabase()
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('global_shortcut', ?)", [shortcut])
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function getCurrentShortcut(): string {
  return currentShortcut
}
