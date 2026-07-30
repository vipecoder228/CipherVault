import Database from 'better-sqlite3'

export type SyncDb = Database.Database

// accounts.auth_hash is argon2's own hash of authSecret (never the raw sync
// password, never the raw authSecret) — see server/src/services/session.ts.
// sessions.token_hash stores sha256(token), never the raw bearer token, so a
// DB dump alone can't be replayed as a session — mirrors the master-password
// verification-hash pattern used for the vault itself.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE,
  auth_hash   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id   TEXT    NOT NULL,
  device_name TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

CREATE TABLE IF NOT EXISTS vault_blobs (
  account_id  INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  blob        TEXT    NOT NULL,
  version     INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  device_id   TEXT    NOT NULL,
  device_name TEXT    NOT NULL
);
`

export function openDb(path: string): SyncDb {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
