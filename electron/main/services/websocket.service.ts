import { WebSocketServer, WebSocket } from 'ws'
import { randomBytes } from 'crypto'
import { getDatabase, saveDatabase } from '../db/connection'
import * as entriesService from './entries.service'
import { isUnlocked, isAlarmMode } from './vault.service'

const PORT = 19823
let wss: WebSocketServer | null = null
let sessionToken: string | null = null

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function getOrGenerateToken(): string {
  if (sessionToken) return sessionToken

  const db = getDatabase() as any
  try {
    const result = db.exec("SELECT value FROM settings WHERE key = 'extension_token'")
    if (result.length > 0 && result[0].values.length > 0) {
      sessionToken = result[0].values[0][0] as string
      return sessionToken!
    }
  } catch {}

  sessionToken = generateToken()
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('extension_token', ?)", [sessionToken])
  saveDatabase()
  return sessionToken!
}

function searchEntriesByDomain(domain: string): Promise<Array<{ id: number; title: string; username: string }>> {
  return entriesService.searchEntriesByDomain(domain)
}

function getEntryCredentials(id: number): Promise<{ id: number; title: string; username: string; password: string } | null> {
  return entriesService.getEntryCredentials(id)
}

function handleMessage(ws: WebSocket, data: string) {
  let msg: any
  try {
    msg = JSON.parse(data)
  } catch {
    ws.send(JSON.stringify({ action: 'error', message: 'Invalid JSON' }))
    return
  }

  switch (msg.action) {
    case 'auth': {
      const token = getOrGenerateToken()
      if (msg.token === token) {
        (ws as any).authenticated = true
        ws.send(JSON.stringify({ action: 'auth-result', ok: true }))
      } else {
        ws.send(JSON.stringify({ action: 'auth-result', ok: false }))
        ws.close()
      }
      break
    }

    case 'check-status': {
      if (!(ws as any).authenticated) {
        ws.send(JSON.stringify({ action: 'error', message: 'Not authenticated' }))
        return
      }
      ws.send(JSON.stringify({
        action: 'status',
        unlocked: isUnlocked(),
        alarmMode: isAlarmMode(),
      }))
      break
    }

    case 'search': {
      if (!(ws as any).authenticated) {
        ws.send(JSON.stringify({ action: 'error', message: 'Not authenticated' }))
        return
      }
      if (!isUnlocked() || isAlarmMode()) {
        ws.send(JSON.stringify({ action: 'search-result', entries: [] }))
        return
      }
      searchEntriesByDomain(msg.domain || '').then((entries) => {
        ws.send(JSON.stringify({ action: 'search-result', entries }))
      }).catch(() => {
        ws.send(JSON.stringify({ action: 'search-result', entries: [] }))
      })
      break
    }

    case 'get-entry': {
      if (!(ws as any).authenticated) {
        ws.send(JSON.stringify({ action: 'error', message: 'Not authenticated' }))
        return
      }
      if (!isUnlocked() || isAlarmMode()) {
        ws.send(JSON.stringify({ action: 'entry-result', entry: null }))
        return
      }
      getEntryCredentials(msg.id).then((entry) => {
        ws.send(JSON.stringify({ action: 'entry-result', entry }))
      }).catch(() => {
        ws.send(JSON.stringify({ action: 'entry-result', entry: null }))
      })
      break
    }

    default:
      ws.send(JSON.stringify({ action: 'error', message: 'Unknown action' }))
  }
}

export function startWebSocketServer(): void {
  if (wss) return

  try {
    wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' })

    wss.on('connection', (ws) => {
      (ws as any).authenticated = false

      ws.on('message', (data) => {
        handleMessage(ws, data.toString())
      })

      ws.on('close', () => {
        (ws as any).authenticated = false
      })
    })

    wss.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[CipherVault] WebSocket port ${PORT} in use — extension server not started`)
        wss = null
      } else {
        console.error('[CipherVault] WebSocket server error:', err)
      }
    })

    console.log(`[CipherVault] WebSocket server listening on ws://127.0.0.1:${PORT}`)
  } catch (err) {
    console.error('[CipherVault] Failed to start WebSocket server:', err)
  }
}

export function stopWebSocketServer(): void {
  if (wss) {
    wss.close()
    wss = null
  }
}

export function getSessionToken(): string {
  return getOrGenerateToken()
}
