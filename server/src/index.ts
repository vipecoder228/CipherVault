import { mkdirSync } from 'fs'
import { join } from 'path'
import { openDb } from './db'
import { createApp } from './app'

const PORT = Number(process.env.PORT) || 8787
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'sync.db')

mkdirSync(DATA_DIR, { recursive: true })

const db = openDb(DB_PATH)
const app = createApp(db)

app.listen(PORT, () => {
  console.log(`[CipherVault Sync] listening on http://127.0.0.1:${PORT}`)
})
