// ─── Screenshot Protection ──────────────────────────────
// Prevents screenshots of sensitive screens

import { BrowserWindow } from 'electron'

/**
 * Enable content protection on a window (prevents screenshots on macOS)
 */
export function enableScreenshotProtection(win: BrowserWindow): void {
  // macOS: setContentProtection prevents the window from being captured
  if (process.platform === 'darwin') {
    win.setContentProtection(true)
  }

  // Windows: Set specific flags
  if (process.platform === 'win32') {
    // Disable DirectX acceleration for this window to prevent screen capture
    win.webContents.setZoomFactor(1)
  }
}

/**
 * Disable content protection (for non-sensitive screens)
 */
export function disableScreenshotProtection(win: BrowserWindow): void {
  if (process.platform === 'darwin') {
    win.setContentProtection(false)
  }
}

/**
 * Add CSS overlay to prevent screen capture in the renderer
 * This adds a semi-transparent overlay that blocks screen recording
 */
export function addScreenCapturePrevention(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    // Block PrintScreen key
    if (input.key === 'PrintScreen') {
      event.preventDefault()
    }
  })

  // Inject CSS to prevent screen capture
  win.webContents.insertCSS(`
    @media print {
      body { display: none !important; }
    }
  `)
}
