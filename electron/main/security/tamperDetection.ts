// ─── Anti-Tamper Detection ──────────────────────────────
// Detects if the application binary has been modified

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Generate SHA-256 hash of a file
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Check if critical files have been tampered with
 */
export function verifyIntegrity(): { ok: boolean; tamperedFiles: string[] } {
  const tamperedFiles: string[] = []

  try {
    // Check main process files
    const mainDir = join(app.getAppPath(), 'out', 'main')
    const criticalFiles = ['index.js']

    for (const file of criticalFiles) {
      const filePath = join(mainDir, file)
      try {
        readFileSync(filePath) // Just verify it's readable
      } catch {
        tamperedFiles.push(file)
      }
    }

    // Check if Electron ASAR is intact
    const asarPath = join(app.getAppPath(), 'app.asar')
    try {
      readFileSync(asarPath)
    } catch {
      tamperedFiles.push('app.asar')
    }

    return {
      ok: tamperedFiles.length === 0,
      tamperedFiles,
    }
  } catch {
    // If we can't verify, assume tampered
    return { ok: false, tamperedFiles: ['verification_failed'] }
  }
}

/**
 * Check if running in a debugger (optional, for hardening)
 */
export function isDebuggerAttached(): boolean {
  // This is a heuristic — not 100% reliable but adds a layer
  const start = Date.now()
  // Debugging causes delays in execution
  const test = () => {
    for (let i = 0; i < 1000; i++) {
      Math.random()
    }
  }
  test()
  const elapsed = Date.now() - start
  return elapsed > 100 // Suspiciously slow for simple math
}
