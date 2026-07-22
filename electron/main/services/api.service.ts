import { createServer, Server } from 'https'
import { timingSafeEqual } from 'crypto'
import { getDatabase } from '../db/connection'
import { getLocalhostCert } from './tlsCert'
import { getEntries, getEntryById } from '../db/queries/entries.queries'
import { decryptJSON } from '../crypto/encryption'
import { getEncryptionKey, getActiveVaultId } from './vault.service'
import { generateTOTPToken } from '../crypto/totp'

let apiServer: Server | null = null
const API_PORT = 19824
let apiKey: string | null = null

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW = 60000 // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

function generateApiKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function authenticateRequest(req: any): boolean {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (!apiKey || token.length !== apiKey.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(apiKey))
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: any) => body += chunk)
    req.on('end', () => {
      try { resolve(JSON.parse(body)) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

async function handleRequest(req: any, res: any): Promise<void> {
  // CORS headers — only allow localhost (local API)
  const origin = req.headers['origin'] || ''
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1') || !origin
  res.setHeader('Access-Control-Allow-Origin', isLocal ? 'https://localhost:19824' : 'https://localhost:19824')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')

  // Rate limiting
  const clientIp = req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Too many requests' }))
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Auth check (except /status)
  if (req.url !== '/status' && !authenticateRequest(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  try {
    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', version: '13.0.0' }))
      return
    }

    if (req.url === '/entries' && req.method === 'GET') {
      const encKey = getEncryptionKey()
      if (!encKey) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Vault is locked' }))
        return
      }

      const db = await getDatabase()
      const vaultId = getActiveVaultId()
      const entries = getEntries(db, {}, vaultId)

      const result = entries.map(e => ({
        id: e.id,
        type: e.entry_type,
        title: e.display_title,
        url: e.display_url,
        is_favorite: !!e.is_favorite,
      }))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ entries: result }))
      return
    }

    const entryMatch = req.url?.match(/^\/entries\/(\d+)$/)
    if (entryMatch && req.method === 'GET') {
      const id = parseInt(entryMatch[1])

      // Input validation
      if (isNaN(id) || id <= 0 || id > 2147483647) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid entry ID' }))
        return
      }

      const encKey = getEncryptionKey()
      if (!encKey) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Vault is locked' }))
        return
      }

      const db = await getDatabase()
      const row = getEntryById(db, id)
      if (!row) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Entry not found' }))
        return
      }

      const decrypted = decryptJSON<Record<string, string>>(
        { iv: row.iv, ciphertext: row.encrypted_data, authTag: row.auth_tag },
        encKey
      )

      // Generate TOTP if available
      let totp: string | null = null
      if (decrypted.totp_secret) {
        totp = generateTOTPToken(decrypted.totp_secret)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: row.id,
        type: row.entry_type,
        title: row.display_title,
        url: row.display_url,
        username: decrypted.username || '',
        password: decrypted.password || '',
        notes: decrypted.notes || '',
        totp,
      }))
      return
    }

    if (req.url === '/entries/search' && req.method === 'POST') {
      const body = await parseBody(req)
      const domain = body.domain || ''

      // Input validation
      if (!domain || typeof domain !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Domain is required' }))
        return
      }
      if (domain.length > 253) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Domain too long' }))
        return
      }

      const encKey = getEncryptionKey()
      if (!encKey) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Vault is locked' }))
        return
      }

      const db = await getDatabase()
      const vaultId = getActiveVaultId()
      const entries = getEntries(db, {}, vaultId)

      const matches: any[] = []
      for (const entry of entries) {
        try {
          const decrypted = decryptJSON<{ url?: string; username?: string }>(
            { iv: entry.iv, ciphertext: entry.encrypted_data, authTag: entry.auth_tag },
            encKey
          )

          if (decrypted.url) {
            try {
              const stored = new URL(decrypted.url)
              if (stored.hostname === domain || stored.hostname.endsWith('.' + domain)) {
                matches.push({
                  id: entry.id,
                  title: entry.display_title,
                  username: decrypted.username || '',
                })
              }
            } catch {
              if (decrypted.url.toLowerCase().includes(domain.toLowerCase())) {
                matches.push({
                  id: entry.id,
                  title: entry.display_title,
                  username: decrypted.username || '',
                })
              }
            }
          }
        } catch {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ entries: matches }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Internal error' }))
  }
}

export async function startApiServer(): Promise<{ port: number; apiKey: string }> {
  if (apiServer) return { port: API_PORT, apiKey: apiKey! }

  apiKey = generateApiKey()
  const { cert, key } = await getLocalhostCert()
  apiServer = createServer({ cert, key }, handleRequest)

  apiServer.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[CipherVault] API server listening on https://127.0.0.1:${API_PORT}`)
  })

  return { port: API_PORT, apiKey }
}

export function stopApiServer(): void {
  if (apiServer) {
    apiServer.close()
    apiServer = null
    apiKey = null
  }
}

export function getApiKey(): string | null {
  return apiKey
}
