import { randomBytes } from 'crypto'
import type { PasswordOptions } from '../../shared/types'

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'

export function generatePassword(options: PasswordOptions): string {
  let charset = ''

  if (options.uppercase) charset += UPPERCASE
  if (options.lowercase) charset += LOWERCASE
  if (options.numbers) charset += NUMBERS
  if (options.symbols) charset += SYMBOLS

  if (!charset) {
    charset = LOWERCASE // Fallback
  }

  const length = Math.max(8, Math.min(128, options.length))
  const bytes = randomBytes(length)
  let password = ''

  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length]
  }

  // Ensure at least one character from each selected type
  const ensureChars: string[] = []
  if (options.uppercase) ensureChars.push(UPPERCASE[randomBytes(1)[0] % UPPERCASE.length])
  if (options.lowercase) ensureChars.push(LOWERCASE[randomBytes(1)[0] % LOWERCASE.length])
  if (options.numbers) ensureChars.push(NUMBERS[randomBytes(1)[0] % NUMBERS.length])
  if (options.symbols) ensureChars.push(SYMBOLS[randomBytes(1)[0] % SYMBOLS.length])

  // Replace random positions with guaranteed characters
  const pwArray = password.split('')
  const positions = randomBytes(ensureChars.length)
  for (let i = 0; i < ensureChars.length; i++) {
    const pos = positions[i] % pwArray.length
    pwArray[pos] = ensureChars[i]
  }

  return pwArray.join('')
}
