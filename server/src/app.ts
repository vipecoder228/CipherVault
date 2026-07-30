import express, { type Express } from 'express'
import type { SyncDb } from './db'
import { createAuthRouter } from './routes/auth'
import { createVaultRouter } from './routes/vault'
import { requireAuth } from './middleware/auth'

const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW_MS = 60_000

// Mirrors electron/main/services/api.service.ts's in-memory per-IP limiter —
// same shape, no external dependency, appropriate for a single-process
// self-hosted server.
function createRateLimiter() {
  const map = new Map<string, { count: number; resetTime: number }>()
  return (ip: string): boolean => {
    const now = Date.now()
    const entry = map.get(ip)
    if (!entry || now > entry.resetTime) {
      map.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
      return true
    }
    if (entry.count >= RATE_LIMIT_MAX) return false
    entry.count++
    return true
  }
}

// Separated from index.ts's listen() call so tests can exercise the app
// in-process (supertest) against an in-memory db without binding a real port.
export function createApp(db: SyncDb): Express {
  const app = express()
  const checkRateLimit = createRateLimiter()

  app.use(express.json({ limit: '65mb' }))

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')

    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    next()
  })

  app.get('/status', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/auth', createAuthRouter(db))
  app.use('/api/vault', requireAuth(db), createVaultRouter(db))

  // Unhandled route/error fallback — never leak stack traces to clients.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large' })
      return
    }
    res.status(400).json({ error: 'Invalid request' })
  })

  return app
}
