import { argon2id } from 'hash-wasm'
import { CRYPTO } from './constants'

export type KdfType = 'argon2id' | 'pbkdf2'

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

// Argon2id Key Derivation (OWASP recommended) via WASM — works in browser/Capacitor WebView
export async function deriveKeyArgon2id(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    iterations: CRYPTO.ARGON2.TIME_COST,
    parallelism: CRYPTO.ARGON2.PARALLELISM,
    memorySize: CRYPTO.ARGON2.MEMORY_COST,
    hashLength: CRYPTO.PBKDF2.KEY_LENGTH, // 64 bytes: split into encryption + HMAC key
    outputType: 'binary',
  })
}

// Single 32-byte Argon2id key, no enc/HMAC split — mirrors
// electron/main/crypto/keyderivation.ts's deriveKey exactly (same
// time/memory/parallelism/hashLength), so the same password+salt produce the
// same key on both platforms. Used for the panic-backup envelope, which needs
// a plain AES-256 key rather than the vault's split encryption+HMAC key.
export async function deriveKeyArgon2id32(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    iterations: CRYPTO.ARGON2.TIME_COST,
    parallelism: CRYPTO.ARGON2.PARALLELISM,
    memorySize: CRYPTO.ARGON2.MEMORY_COST,
    hashLength: CRYPTO.ARGON2.KEY_LENGTH, // 32 bytes
    outputType: 'binary',
  })
}

// Legacy PBKDF2 Key Derivation using Web Crypto API — kept only to unlock
// pre-existing vaults; new/migrated vaults use deriveKeyArgon2id above.
export async function deriveKeyPbkdf2(
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
      salt: salt.slice().buffer,
      iterations: CRYPTO.PBKDF2.ITERATIONS,
      hash: CRYPTO.PBKDF2.DIGEST,
    },
    keyMaterial,
    CRYPTO.PBKDF2.KEY_LENGTH * 8 // bits
  )

  return new Uint8Array(derivedBits)
}

// Derive a key using the KDF stored for a given vault (defaults to Argon2id for new vaults)
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  kdfType: KdfType = 'argon2id',
): Promise<Uint8Array> {
  return kdfType === 'pbkdf2'
    ? deriveKeyPbkdf2(password, salt)
    : deriveKeyArgon2id(password, salt)
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
