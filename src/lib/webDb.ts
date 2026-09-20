import initSqlJsWasm, { type Database } from 'sql.js'
import { isCapacitor, isTauri } from '../../shared/bridge'

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

  // v14: Add display_url for unencrypted URL display in list
  `ALTER TABLE encrypted_entries ADD COLUMN display_url TEXT NOT NULL DEFAULT '';`,

  // v15/v16: File attachments — metadata only, encrypted bytes live under
  // Directory.Data/attachments/ (mirrors electron/main/db/migrations.ts v16)
  `CREATE TABLE IF NOT EXISTS attachments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id      INTEGER NOT NULL REFERENCES encrypted_entries(id) ON DELETE CASCADE,
    storage_key   TEXT    NOT NULL UNIQUE,
    filename      TEXT    NOT NULL,
    mime_type     TEXT    NOT NULL,
    size          INTEGER NOT NULL,
    iv            TEXT    NOT NULL,
    auth_tag      TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_entry ON attachments(entry_id);`,
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

const SQLITE_MAGIC = 'SQLite format 3'

export function arrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToArray(b64: string): Uint8Array {
  const binaryString = atob(b64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

function isValidSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false
  // The real SQLite header is "SQLite format 3\000" (16 bytes, NUL-terminated),
  // so decode only the 15 magic bytes rather than requiring an exact 16-byte match.
  const header = new TextDecoder().decode(bytes.slice(0, SQLITE_MAGIC.length))
  return header === SQLITE_MAGIC
}

// Platform-specific filesystem helpers
async function fsReadFile(path: string): Promise<string | null> {
  if (isCapacitor || !isTauri) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({ path, directory: Directory.Data })
      return (result as any).data as string
    } catch { return null }
  }
  if (isTauri) {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      return await readTextFile(path, { baseDir: BaseDirectory.AppData })
    } catch { return null }
  }
  return null
}

async function fsWriteFile(path: string, data: string, encoding?: string): Promise<void> {
  if (isCapacitor || !isTauri) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path, data, directory: Directory.Data,
      encoding: (encoding || 'utf8') as any,
    })
    return
  }
  if (isTauri) {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, data, { baseDir: BaseDirectory.AppData })
  }
}

// Try Capacitor/Tauri filesystem first, fall back to localStorage
// Validates data is a real SQLite database before returning
async function loadDbFromDisk(): Promise<Uint8Array | null> {
  // Try native filesystem first
  const b64 = await fsReadFile(DB_FILE)
  if (b64 && b64.length > 0) {
    const bytes = base64ToArray(b64)
    if (isValidSqlite(bytes)) {
      console.log('[DB] Loaded valid database from native filesystem')
      return bytes
    }
    console.warn('[DB] Native filesystem has invalid DB, falling back to localStorage')
  }

  // Fallback: localStorage
  try {
    const stored = localStorage.getItem('ciphervault_db')
    if (stored && stored.length > 0) {
      const bytes = base64ToArray(stored)
      if (isValidSqlite(bytes)) {
        console.log('[DB] Loaded valid database from localStorage')
        return bytes
      }
      console.warn('[DB] localStorage has invalid DB data')
    }
  } catch {}

  console.log('[DB] No valid database found, will create new one')
  return null
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
    // sql.js's export() resets PRAGMA foreign_keys to OFF on the live connection
    // it was called on — restore it immediately so ON DELETE CASCADE (attachments,
    // entry_history) keeps working for the rest of this session.
    database.run('PRAGMA foreign_keys = ON')
    const bytes = new Uint8Array(data)
    const base64 = arrayToBase64(bytes)

    // ALWAYS save to localStorage (most reliable in WebView)
    localStorage.setItem('ciphervault_db', base64)

    // ALSO try native filesystem (backup)
    try {
      await fsWriteFile(DB_FILE, base64, 'base64')
    } catch {
      // Native filesystem not available — localStorage already saved above
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

// Replaces the entire local database with `bytes` (a full sqlite file, e.g.
// pulled from the remote sync server) and persists it. Used for whole-vault
// pull, as opposed to the per-table merge in src/services/googleDriveSync.ts.
export async function replaceWebDatabase(bytes: Uint8Array): Promise<void> {
  if (!isValidSqlite(bytes)) throw new Error('Invalid database file')
  const SQL = await initSql()
  const newDb = new SQL.Database(bytes)
  newDb.run('PRAGMA foreign_keys = ON')
  if (db) db.close()
  db = newDb
  await saveDbToDisk(db)
}
