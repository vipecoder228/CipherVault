import { describe, it, expect, beforeEach, vi } from 'vitest'

// sql.js's WASM loader has no .wasm file available under vitest/Node and its
// abort handler leaves a floating unhandled rejection even after the sync
// failure is caught by webDb's own try/catch fallback to asm.js. Skip the
// WASM attempt entirely so tests go straight to the (real, working) asm.js path.
vi.mock('sql.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sql.js')>()
  return { ...actual, default: () => Promise.reject(new Error('wasm disabled in tests')) }
})

// Each test gets a fresh module graph so webDb's module-level `db` singleton
// (and webBackend's in-memory vault state) don't leak between tests.
async function freshBackend() {
  vi.resetModules()
  const backend = await import('../webBackend')
  const db = await import('../webDb')
  return { backend, db }
}

describe('webBackend kdf_type branching', () => {
  beforeEach(() => {
    // webDb falls back to localStorage when Capacitor's filesystem plugin is
    // unavailable (true under Node/vitest) — stub it so persistence is a no-op
    // instead of throwing ReferenceError: localStorage is not defined.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
  })

  it('new vaults are created with kdf_type argon2id', async () => {
    const { backend, db } = await freshBackend()
    const setup = await backend.webHandlers['vault:setup'](null, 'master-pw')
    expect(setup.success).toBe(true)

    const vault = db.webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [setup.vaultId])
    expect(vault.kdf_type).toBe('argon2id')
  })

  it('unlocking a legacy pbkdf2 vault migrates it to argon2id in place', async () => {
    const { backend, db } = await freshBackend()
    const setup = await backend.webHandlers['vault:setup'](null, 'master-pw')
    const vaultId = setup.vaultId

    // Force the vault back to a legacy pbkdf2 state, as if it had been
    // created before Argon2id support existed on web/mobile.
    const { deriveKeyPbkdf2, splitDerivedKey, computeVerificationHash, generateSalt, } =
      await import('../../../shared/crypto/keyderivation')
    const legacySalt = generateSalt()
    const legacyKey = await deriveKeyPbkdf2('master-pw', legacySalt)
    const { encryptionKey } = splitDerivedKey(legacyKey)
    const legacyHash = await computeVerificationHash(encryptionKey)
    const legacySaltHex = Array.from(legacySalt).map(b => b.toString(16).padStart(2, '0')).join('')
    db.webRun(
      `UPDATE vault SET master_hash = ?, kdf_salt = ?, kdf_type = 'pbkdf2' WHERE id = ?`,
      [legacyHash, legacySaltHex, vaultId]
    )
    await backend.webHandlers['vault:lock']()

    const unlock = await backend.webHandlers['vault:unlock'](null, 'master-pw')
    expect(unlock.success).toBe(true)

    const vaultAfter = db.webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [vaultId])
    expect(vaultAfter.kdf_type).toBe('argon2id')
    expect(vaultAfter.kdf_salt).not.toBe(legacySaltHex)

    // Migration must actually re-key usably: lock and unlock again with the
    // same password, now against the freshly-migrated argon2id record.
    await backend.webHandlers['vault:lock']()
    const secondUnlock = await backend.webHandlers['vault:unlock'](null, 'master-pw')
    expect(secondUnlock.success).toBe(true)
  })

  it('unlocking an already-argon2id vault does not change kdf_salt', async () => {
    const { backend, db } = await freshBackend()
    const setup = await backend.webHandlers['vault:setup'](null, 'master-pw')
    const vaultId = setup.vaultId

    const before = db.webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [vaultId])
    await backend.webHandlers['vault:lock']()

    const unlock = await backend.webHandlers['vault:unlock'](null, 'master-pw')
    expect(unlock.success).toBe(true)

    const after = db.webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [vaultId])
    expect(after.kdf_type).toBe('argon2id')
    expect(after.kdf_salt).toBe(before.kdf_salt)
  })

  it('alarm password unlock uses the vault kdf_type and does not trigger migration', async () => {
    const { backend, db } = await freshBackend()
    const setup = await backend.webHandlers['vault:setup'](null, 'master-pw', 'alarm-pw')
    const vaultId = setup.vaultId

    // Downgrade to legacy pbkdf2, mirroring a vault created before Argon2id
    // support, with both master and alarm hashes derived via pbkdf2.
    const { deriveKeyPbkdf2, splitDerivedKey, computeVerificationHash, generateSalt } =
      await import('../../../shared/crypto/keyderivation')
    const legacySalt = generateSalt()
    const legacyKey = await deriveKeyPbkdf2('master-pw', legacySalt)
    const legacyHash = await computeVerificationHash(splitDerivedKey(legacyKey).encryptionKey)
    const legacySaltHex = Array.from(legacySalt).map(b => b.toString(16).padStart(2, '0')).join('')

    const alarmSalt = generateSalt()
    const alarmKey = await deriveKeyPbkdf2('alarm-pw', alarmSalt)
    const alarmHash = await computeVerificationHash(splitDerivedKey(alarmKey).encryptionKey)
    const alarmSaltHex = Array.from(alarmSalt).map(b => b.toString(16).padStart(2, '0')).join('')

    db.webRun(
      `UPDATE vault SET master_hash = ?, kdf_salt = ?, kdf_type = 'pbkdf2', alarm_hash = ?, alarm_salt = ? WHERE id = ?`,
      [legacyHash, legacySaltHex, alarmHash, alarmSaltHex, vaultId]
    )
    await backend.webHandlers['vault:lock']()

    const unlock = await backend.webHandlers['vault:unlock'](null, 'alarm-pw')
    expect(unlock.success).toBe(true)
    expect(unlock.alarmMode).toBe(true)

    // Alarm unlock must not trigger the migration path.
    const vaultAfter = db.webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [vaultId])
    expect(vaultAfter.kdf_type).toBe('pbkdf2')
    expect(vaultAfter.kdf_salt).toBe(legacySaltHex)
  })

  it('unlock still succeeds on legacy kdf_salt/hash if migration throws mid-flight', async () => {
    const { backend, db } = await freshBackend()
    const setup = await backend.webHandlers['vault:setup'](null, 'master-pw')
    const vaultId = setup.vaultId

    const { deriveKeyPbkdf2, splitDerivedKey, computeVerificationHash, generateSalt } =
      await import('../../../shared/crypto/keyderivation')
    const legacySalt = generateSalt()
    const legacyKey = await deriveKeyPbkdf2('master-pw', legacySalt)
    const legacyHash = await computeVerificationHash(splitDerivedKey(legacyKey).encryptionKey)
    const legacySaltHex = Array.from(legacySalt).map(b => b.toString(16).padStart(2, '0')).join('')
    db.webRun(
      `UPDATE vault SET master_hash = ?, kdf_salt = ?, kdf_type = 'pbkdf2' WHERE id = ?`,
      [legacyHash, legacySaltHex, vaultId]
    )
    await backend.webHandlers['vault:lock']()

    // Make the migration's re-encryption pass blow up (simulates a mid-flight
    // failure) by poisoning webRun for the BEGIN TRANSACTION call it issues.
    const originalWebRun = db.webRun
    const spy = vi.spyOn(db, 'webRun').mockImplementation((sql: string, params: any[] = []) => {
      if (sql === 'BEGIN TRANSACTION') {
        throw new Error('simulated migration failure')
      }
      return originalWebRun(sql, params)
    })

    const unlock = await backend.webHandlers['vault:unlock'](null, 'master-pw')
    expect(unlock.success).toBe(true)

    spy.mockRestore()

    // Best-effort migration failed, so the vault must remain on its legacy
    // KDF/salt/hash — not left half-migrated.
    const vaultAfter = db.webQueryOne<any>('SELECT * FROM vault WHERE id = ?', [vaultId])
    expect(vaultAfter.kdf_type).toBe('pbkdf2')
    expect(vaultAfter.kdf_salt).toBe(legacySaltHex)

    // And the vault must still be usable with the same password afterward.
    await backend.webHandlers['vault:lock']()
    const secondUnlock = await backend.webHandlers['vault:unlock'](null, 'master-pw')
    expect(secondUnlock.success).toBe(true)
  })
})
