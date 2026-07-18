import { CRYPTO } from './constants'

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

// Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Generate random bytes
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(CRYPTO.SALT_SIZE))
}

// PBKDF2 Key Derivation using Web Crypto API
export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  // Import password as key material
  const passwordBytes = new TextEncoder().encode(password)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: CRYPTO.PBKDF2.ITERATIONS,
      hash: CRYPTO.PBKDF2.DIGEST,
    },
    keyMaterial,
    CRYPTO.PBKDF2.KEY_LENGTH * 8 // bits
  )

  return new Uint8Array(derivedBits)
}

// Split derived key into encryption + HMAC keys
export function splitDerivedKey(derivedKey: Uint8Array): {
  encryptionKey: Uint8Array
  hmacKey: Uint8Array
} {
  return {
    encryptionKey: derivedKey.slice(0, 32),
    hmacKey: derivedKey.slice(32, 64),
  }
}

// Verification Hash
export async function computeVerificationHash(encryptionKey: Uint8Array): Promise<string> {
  const verifyString = new TextEncoder().encode(CRYPTO.VERIFICATION_STRING)
  const data = new Uint8Array(encryptionKey.length + verifyString.length)
  data.set(encryptionKey)
  data.set(verifyString, encryptionKey.length)

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(hashBuffer))
}

// Timing-safe comparison
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

// Helper: Convert hex to Uint8Array
export function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex)
}

// Helper: Convert Uint8Array to hex
export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes)
}
