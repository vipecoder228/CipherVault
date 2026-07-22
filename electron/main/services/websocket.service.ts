import { WebSocketServer, WebSocket } from 'ws'
import { randomBytes } from 'crypto'
import * as entriesService from './entries.service'
import { isUnlocked, isAlarmMode } from './vault.service'
import { saveSecret, getSecret } from './secretStorage'

const PORT = 19823
const MAX_CONNECTIONS = 3
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
let wss: WebSocketServer | null = null
let sessionToken: string | null = null
let tokenCreatedAt: number = 0
let connectionCount = 0

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

async function getOrGenerateToken(): Promise<string> {
  if (sessionToken && Date.now() - tokenCreatedAt < TOKEN_TTL_MS) {
    return sessionToken
  }

  try {
    const stored = await getSecret('extension_token')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.token && parsed.createdAt && Date.now() - parsed.createdAt < TOKEN_TTL_MS) {
        sessionToken = parsed.token
        tokenCreatedAt = parsed.createdAt
        return sessionToken!
      }
    }
  } catch {}

  // Token expired or missing — rotate
  sessionToken = generateToken()
  tokenCreatedAt = Date.now()
  await saveSecret('extension_token', JSON.stringify({ token: sessionToken, createdAt: tokenCreatedAt }))
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
      getOrGenerateToken().then(token => {
        if (msg.token === token) {
          (ws as any).authenticated = true
          ws.send(JSON.stringify({ action: 'auth-result', ok: true }))
        } else {
          ws.send(JSON.stringify({ action: 'auth-result', ok: false }))
          ws.close()
        }
      }).catch(() => {
        ws.send(JSON.stringify({ action: 'auth-result', ok: false }))
        ws.close()
      })
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
      connectionCount++

      // Always register close handler so connectionCount decrements
      ws.on('close', () => {
        connectionCount = Math.max(0, connectionCount - 1)
        ;(ws as any).authenticated = false
      })

      // Enforce connection limit
      if (connectionCount > MAX_CONNECTIONS) {
        ws.close(1013, 'Too many connections')
        return
      }

      ;(ws as any).authenticated = false

      ws.on('message', (data) => {
        handleMessage(ws, data.toString())
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

export async function getSessionToken(): Promise<string> {
  return getOrGenerateToken()
}
