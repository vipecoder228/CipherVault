import type { Database } from 'sql.js'

const MIGRATIONS = [
  // v1: Initial schema
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

  // v8: Add display_title for unencrypted search/display
  `ALTER TABLE encrypted_entries ADD COLUMN display_title TEXT NOT NULL DEFAULT '';`,
  `CREATE INDEX IF NOT EXISTS idx_entries_display_title ON encrypted_entries(display_title);`,

  // v9: Add alarm/duress code support
  `ALTER TABLE vault ADD COLUMN alarm_hash TEXT;`,
  `ALTER TABLE vault ADD COLUMN alarm_salt TEXT;`,

  // v10: Multi-vault support — add vault_id to entries
  `ALTER TABLE encrypted_entries ADD COLUMN vault_id INTEGER NOT NULL DEFAULT 1;`,
  `CREATE INDEX IF NOT EXISTS idx_entries_vault ON encrypted_entries(vault_id);`,

  // v11: Vault display name
  `ALTER TABLE vault ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Main Vault';`,

  // v12: Disposable emails
  `CREATE TABLE IF NOT EXISTS disposable_emails (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    address     TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    token       TEXT,
    account_id  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
]

export function runMigrations(db: Database): void {
  // Create migrations tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Get applied migrations
  const result = db.exec('SELECT version FROM _migrations')
  const appliedVersions = new Set<number>()
  if (result.length > 0) {
    for (const row of result[0].values) {
      appliedVersions.add(row[0] as number)
    }
  }

  // Run pending migrations
  MIGRATIONS.forEach((sql, index) => {
    if (!appliedVersions.has(index)) {
      db.run(sql)
      db.run('INSERT INTO _migrations (version) VALUES (?)', [index])
    }
  })
}
