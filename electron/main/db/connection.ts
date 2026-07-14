import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { runMigrations } from './migrations'

let db: Database | null = null
let dbPath: string = ''
let saveLock = false

export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  const vaultDir = join(userDataPath, 'vault-data')
  if (!existsSync(vaultDir)) {
    mkdirSync(vaultDir, { recursive: true })
  }
  return join(vaultDir, 'vault.db')
}

export async function getDatabase(): Promise<Database> {
  if (db) return db

  dbPath = getDatabasePath()
  const SQL = await initSqlJs()

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Enable WAL-like behavior via pragma
  db.run('PRAGMA foreign_keys = ON')

  runMigrations(db)
  saveDatabase()

  return db
}

export function saveDatabase(): void {
  if (db && dbPath && !saveLock) {
    saveLock = true
    try {
      const data = db.export()
      const buffer = Buffer.from(data)
      writeFileSync(dbPath, buffer)
    } finally {
      saveLock = false
    }
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}
