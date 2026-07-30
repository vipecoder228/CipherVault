// ─── Screenshot Protection ──────────────────────────────
// Prevents screenshots/screen recording of sensitive screens

import { BrowserWindow } from 'electron'

/**
 * Enable content protection on a window (excludes it from screen capture).
 * Supported on macOS and Windows 10 2004+ (via SetWindowDisplayAffinity /
 * WDA_EXCLUDEFROMCAPTURE); older Windows versions render a black window
 * instead of fully excluding it.
 */
export function enableScreenshotProtection(win: BrowserWindow): void {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    win.setContentProtection(true)
  }
}

/**
 * Disable content protection (for non-sensitive screens)
 */
export function disableScreenshotProtection(win: BrowserWindow): void {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    win.setContentProtection(false)
  }
}
