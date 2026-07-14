import { BrowserWindow } from 'electron'

// Get focused window or fallback to first available window
export function getWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}
