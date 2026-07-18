import { createHash, timingSafeEqual } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const HASH_FILE = 'app.sha256'

function getAppHash(): string {
  const exePath = app.getPath('exe')
  const buffer = readFileSync(exePath)
  return createHash('sha256').update(buffer).digest('hex')
}

function getStoredHash(): string | null {
  // Check next to the exe
  const exeDir = join(app.getPath('exe'), '..')
  const hashPath = join(exeDir, HASH_FILE)
  if (existsSync(hashPath)) {
    return readFileSync(hashPath, 'utf-8').trim()
  }

  // Check in app resources
  const resourcePath = join(process.resourcesPath, HASH_FILE)
  if (existsSync(resourcePath)) {
    return readFileSync(resourcePath, 'utf-8').trim()
  }

  // Check in user data (for dev mode)
  const userDataPath = app.getPath('userData')
  const userHashPath = join(userDataPath, HASH_FILE)
  if (existsSync(userHashPath)) {
    return readFileSync(userHashPath, 'utf-8').trim()
  }

  return null
}

export function checkIntegrity(): { ok: boolean; current?: string; expected?: string } {
  const stored = getStoredHash()

  // If no hash file exists, skip check (dev mode)
  if (!stored) {
    return { ok: false }
  }

  const current = getAppHash()
  return {
    ok: timingSafeEqual(Buffer.from(current, 'hex'), Buffer.from(stored, 'hex')),
    current,
    expected: stored,
  }
}
