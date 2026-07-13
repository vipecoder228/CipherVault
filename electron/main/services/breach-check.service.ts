import { createHash } from 'crypto'

const HIBP_API = 'https://api.pwnedpasswords.com/range'

export async function checkBreach(password: string): Promise<{ breached: boolean; count: number }> {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const response = await fetch(`${HIBP_API}/${prefix}`)

    if (!response.ok) {
      return { breached: false, count: 0 }
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
    return { breached: false, count: 0 }
  }
}
