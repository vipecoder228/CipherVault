import initSqlJsWasm, { type Database } from 'sql.js'
import { Filesystem, Directory } from '@capacitor/filesystem'

const DB_FILE = 'vault.db'

let db: Database | null = null
let dbPromise: Promise<Database> | null = null
let saveLock = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function queryAll<T>(db: Database, sql: string, params: any[] = []): T[] {
  const result = db.exec(sql, params)
  if (result.length === 0) return []
  const columns = result[0].columns
  return result[0].values.map((row: any[]) => {
    const obj: any = {}
    columns.forEach((col: string, i: number) => { obj[col] = row[i] })
    return obj as T
  })
}

function queryOne<T>(db: Database, sql: string, params: any[] = []): T | undefined {
  const rows = queryAll<T>(db, sql, params)
  return rows[0]
}

// ─── Migrations ─────────────────────────────────────────

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS vault (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    master_hash   TEXT    NOT NULL,
    kdf_salt      TEXT    NOT NULL,
    kdf_type      TEXT    NOT NULL DEFAULT 'pbkdf2',
    kdf_ops       INTEGER NOT NULL DEFAULT 3,
    totp_secret   TEXT,
    totp_enabled  INTEGER NOT NULL DEFAULT 0,
    auto_lock_ms  INTEGER NOT NULL DEFAULT 300000,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    icon        TEXT    NOT NULL DEFAULT 'folder',
    color       TEXT    NOT NULL DEFAULT '#6366f1',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS encrypted_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_type      TEXT    NOT NULL,
    encrypted_data  TEXT    NOT NULL,
    iv              TEXT    NOT NULL,
    auth_tag        TEXT    NOT NULL,
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_entries_type ON encrypted_entries(entry_type);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_cat ON encrypted_entries(category_id);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_fav ON encrypted_entries(is_favorite);`,
  `CREATE TABLE IF NOT EXISTS entry_history (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id            INTEGER NOT NULL REFERENCES encrypted_entries(id) ON DELETE CASCADE,
    encrypted_snapshot  TEXT    NOT NULL,
    iv                  TEXT    NOT NULL,
    auth_tag            TEXT    NOT NULL,
    change_type         TEXT    NOT NULL,
    changed_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_history_entry ON entry_history(entry_id, changed_at DESC);`,
  `CREATE TABLE IF NOT EXISTS unlock_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    success      INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  `ALTER TABLE encrypted_entries ADD COLUMN display_title TEXT NOT NULL DEFAULT '';`,
  `CREATE INDEX IF NOT EXISTS idx_entries_display_title ON encrypted_entries(display_title);`,
  `ALTER TABLE vault ADD COLUMN alarm_hash TEXT;`,
  `ALTER TABLE vault ADD COLUMN alarm_salt TEXT;`,
  `ALTER TABLE encrypted_entries ADD COLUMN vault_id INTEGER NOT NULL DEFAULT 1;`,
  `CREATE INDEX IF NOT EXISTS idx_entries_vault ON encrypted_entries(vault_id);`,
  `ALTER TABLE vault ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Main Vault';`,
  `CREATE TABLE IF NOT EXISTS disposable_emails (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    address     TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    token       TEXT,
    account_id  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `ALTER TABLE encrypted_entries ADD COLUMN deleted_at TEXT;`,
  `CREATE INDEX IF NOT EXISTS idx_entries_deleted ON encrypted_entries(deleted_at);`,
]

function runMigrations(database: Database): void {
  database.run(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`)

  const result = database.exec('SELECT version FROM _migrations')
  const applied = new Set<number>()
  if (result.length > 0) {
    for (const row of result[0].values) {
      applied.add(row[0] as number)
    }
  }

  MIGRATIONS.forEach((sql, index) => {
    if (!applied.has(index)) {
      try {
        database.run(sql)
        database.run('INSERT INTO _migrations (version) VALUES (?)', [index])
      } catch {
        try {
          database.run('INSERT INTO _migrations (version) VALUES (?)', [index])
        } catch {}
      }
    }
  })
}

// ─── Database Persistence ───────────────────────────────

function arrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArray(b64: string): Uint8Array {
  const binaryString = atob(b64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// Try Capacitor filesystem first, fall back to localStorage
async function loadDbFromDisk(): Promise<Uint8Array | null> {
  // Try Capacitor filesystem first
  try {
    const result = await Filesystem.readFile({
      path: DB_FILE,
      directory: Directory.Data,
    })
    const b64 = (result as any).data as string
    return base64ToArray(b64)
  } catch {
    // File doesn't exist or Capacitor not available — try localStorage
    try {
      const stored = localStorage.getItem('ciphervault_db')
      if (stored) return base64ToArray(stored)
    } catch {}
    return null
  }
}

async function saveDbToDisk(database: Database): Promise<void> {
  if (saveLock) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveDbToDisk(database), 200)
    return
  }
  saveLock = true
  try {
    const data = database.export()
    const bytes = new Uint8Array(data)
    const base64 = arrayToBase64(bytes)

    // Try Capacitor filesystem first
    try {
      await Filesystem.writeFile({
        path: DB_FILE,
        data: base64,
        directory: Directory.Data,
        encoding: 'base64' as any,
      })
    } catch {
      // Capacitor not available — fall back to localStorage
      localStorage.setItem('ciphervault_db', base64)
    }
  } catch (err) {
    console.error('Failed to save database:', err)
  } finally {
    saveLock = false
  }
}

// ─── Database Initialization ────────────────────────────

async function initSql(): Promise<any> {
  // Try WASM first
  try {
    console.log('[DB] Trying sql.js WASM...')
    const SQL = await initSqlJsWasm({
      locateFile: (file: string) => `/${file}`,
    })
    console.log('[DB] WASM loaded successfully')
    return SQL
  } catch (wasmErr) {
    console.warn('[DB] WASM failed, trying asm.js fallback:', wasmErr)
  }

  // Fallback: pure JS asm.js (no WASM needed)
  try {
    const mod = await import('sql.js/dist/sql-asm.js')
    const initAsm = mod.default
    console.log('[DB] Loading asm.js...')
    const SQL = await initAsm()
    console.log('[DB] asm.js loaded successfully')
    return SQL
  } catch (asmErr) {
    console.error('[DB] asm.js also failed:', asmErr)
    throw asmErr
  }
}

export async function getWebDatabase(): Promise<Database> {
  if (db) return db

  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const SQL = await initSql()

        const existing = await loadDbFromDisk()

        if (existing) {
          db = new SQL.Database(existing)
        } else {
          db = new SQL.Database()
        }

        db.run('PRAGMA foreign_keys = ON')
        runMigrations(db)
        await saveDbToDisk(db)

        return db!
      } catch (err) {
        dbPromise = null
        throw err
      }
    })()
  }

  return dbPromise
}

export async function saveWebDatabase(): Promise<void> {
  if (db) {
    await saveDbToDisk(db)
  }
}

// ─── Query Helpers (exported for use in backend) ────────

export function webQueryAll<T>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('Database not initialized')
  return queryAll<T>(db, sql, params)
}

export function webQueryOne<T>(sql: string, params: any[] = []): T | undefined {
  if (!db) throw new Error('Database not initialized')
  return queryOne<T>(db, sql, params)
}

export function webRun(sql: string, params: any[] = []): void {
  if (!db) throw new Error('Database not initialized')
  db.run(sql, params)
}

export function getRawDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
