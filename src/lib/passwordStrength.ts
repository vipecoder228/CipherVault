export function calculateStrength(password: string): {
  score: number
  label: string
  color: string
} {
  let score = 0

  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (password.length >= 20) score++

  if (score <= 2) return { score: 1, label: 'Weak', color: '#ef4444' }
  if (score <= 4) return { score: 2, label: 'Fair', color: '#f59e0b' }
  if (score <= 6) return { score: 3, label: 'Good', color: '#3b82f6' }
  return { score: 4, label: 'Strong', color: '#22c55e' }
}

export function estimateCrackTime(password: string): string {
  if (!password) return ''

  let charsetSize = 0
  if (/[a-z]/.test(password)) charsetSize += 26
  if (/[A-Z]/.test(password)) charsetSize += 26
  if (/[0-9]/.test(password)) charsetSize += 10
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 33

  if (charsetSize === 0) return 'instantly'

  // Calculate combinations: charsetSize^passwordLength
  const combinations = Math.pow(charsetSize, password.length)
  // Assume 10 billion guesses per second (modern GPU cluster)
  const guessesPerSecond = 10_000_000_000
  const seconds = combinations / guessesPerSecond / 2 // average case

  if (seconds < 1) return 'instantly'
  if (seconds < 60) return `${Math.round(seconds)} seconds`
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`
  if (seconds < 86400 * 30) return `${Math.round(seconds / 86400)} days`
  if (seconds < 86400 * 365) return `${Math.round(seconds / (86400 * 30))} months`
  if (seconds < 86400 * 365 * 1000) return `${Math.round(seconds / (86400 * 365))} years`
  if (seconds < 86400 * 365 * 1_000_000) return `${Math.round(seconds / (86400 * 365 * 1000))}K years`
  if (seconds < 86400 * 365 * 1_000_000_000) return `${Math.round(seconds / (86400 * 365 * 1_000_000))}M years`
  return 'centuries+'
}
