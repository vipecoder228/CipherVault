// ─── Anti-Tamper Detection ──────────────────────────────
// Detects if the application binary has been modified

import { createHash, timingSafeEqual } from 'crypto'
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
 * Check if critical files have been tampered with by verifying hashes
 */
export function verifyIntegrity(): { ok: boolean; tamperedFiles: string[] } {
  const tamperedFiles: string[] = []

  try {
    const mainDir = join(app.getAppPath(), 'out', 'main')

    // Known critical files and their expected hashes
    // These are generated during the build process
    const hashStorePath = join(app.getAppPath(), 'out', 'main', '.file-hashes.json')
    let expectedHashes: Record<string, string> = {}

    try {
      const hashStore = readFileSync(hashStorePath, 'utf-8')
      expectedHashes = JSON.parse(hashStore)
    } catch {
      // No hash store — skip verification (dev mode)
      return { ok: true, tamperedFiles: [] }
    }

    for (const [file, expectedHash] of Object.entries(expectedHashes)) {
      const filePath = join(mainDir, file)
      try {
        const currentHash = hashFile(filePath)
        const hashBuf = Buffer.from(currentHash, 'hex')
        const expectedBuf = Buffer.from(expectedHash, 'hex')

        if (hashBuf.length !== expectedBuf.length || !timingSafeEqual(hashBuf, expectedBuf)) {
          tamperedFiles.push(file)
        }
      } catch {
        tamperedFiles.push(file)
      }
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
