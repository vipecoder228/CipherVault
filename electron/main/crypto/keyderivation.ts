import { randomBytes, createHash } from 'crypto'
import { CRYPTO } from './constants'

// ─── Argon2id Key Derivation (OWASP recommended) ──────

export async function deriveKey(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  // Use argon2id for key derivation
  const { hash: argon2Hash } = await import('argon2')

  const key = await argon2Hash(password, {
    salt: salt,
    type: 2, // argon2id
    timeCost: CRYPTO.ARGON2.TIME_COST,
    memoryCost: CRYPTO.ARGON2.MEMORY_COST,
    parallelism: CRYPTO.ARGON2.PARALLELISM,
    hashLength: CRYPTO.ARGON2.KEY_LENGTH,
    raw: true,
  })

  return Buffer.from(key)
}

// ─── Split derived key into encryption + HMAC keys ──────

export function splitDerivedKey(derivedKey: Buffer): {
  encryptionKey: Buffer
  hmacKey: Buffer
} {
  return {
    encryptionKey: derivedKey.subarray(0, 32),
    hmacKey: derivedKey.subarray(32, 64),
  }
}

// ─── Verification Hash ──────────────────────────────────

export async function computeVerificationHash(encryptionKey: Buffer): Promise<string> {
  return createHash('sha256')
    .update(Buffer.concat([encryptionKey, Buffer.from(CRYPTO.VERIFICATION_STRING)]))
    .digest('hex')
}

// ─── Salt Generation ────────────────────────────────────

export function generateSalt(): Buffer {
  return randomBytes(CRYPTO.SALT_SIZE)
}
