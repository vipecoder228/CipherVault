import { createHash } from 'crypto'

const HIBP_API = 'https://api.pwnedpasswords.com/range'

// HIBP k-anonymity API requires SHA-1 prefix — this is NOT password storage
export async function checkBreach(password: string): Promise<{ breached: boolean; count: number; rateLimited?: boolean }> {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const response = await fetch(`${HIBP_API}/${prefix}`)

    if (response.status === 429 || response.status === 403) {
      return { breached: false, count: 0, rateLimited: true }
    }

    if (!response.ok) {
      return { breached: false, count: 0, rateLimited: true }
    }

    const text = await response.text()
    const lines = text.split('\n')

    for (const line of lines) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix.trim() === suffix) {
        return { breached: true, count: parseInt(count.trim(), 10) }
      }
    }

    return { breached: false, count: 0 }
  } catch {
    // Network error — fail open, don't block user
    return { breached: false, count: 0, rateLimited: true }
  }
}
