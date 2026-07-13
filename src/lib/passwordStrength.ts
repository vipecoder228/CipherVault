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
