import { BrowserWindow } from 'electron'

// Get focused window or fallback to first available window
export function getWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

export function toggleWindow(): void {
  const win = getWindow()
  if (!win) return
  if (win.isVisible()) {
    win.hide()
    win.setSkipTaskbar(true)
  } else {
    win.show()
    win.setSkipTaskbar(false)
    win.focus()
  }
}
