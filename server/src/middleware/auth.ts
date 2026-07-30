import type { Request, Response, NextFunction } from 'express'
import type { SyncDb } from '../db'
import { verifySession } from '../services/session'

export function requireAuth(db: SyncDb) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['authorization']
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const token = header.slice(7)
    const session = verifySession(db, token)
    if (!session) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    ;(req as any).session = session
    ;(req as any).sessionToken = token
    next()
  }
}
