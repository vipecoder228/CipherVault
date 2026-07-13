import { randomBytes, pbkdf2Sync, createHash } from 'crypto'
import { CRYPTO } from './constants'

// ─── PBKDF2 Key Derivation (built into Node.js) ────────

export function deriveKey(
  password: string,
  salt: Buffer,
  _type: 'argon2id' | 'pbkdf2' = 'pbkdf2'
): Buffer {
  return pbkdf2Sync(
    password,
    salt,
    CRYPTO.PBKDF2.ITERATIONS,
    CRYPTO.PBKDF2.KEY_LENGTH,
    CRYPTO.PBKDF2.DIGEST
  )
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

export function computeVerificationHash(encryptionKey: Buffer): string {
  return createHash('sha256')
    .update(Buffer.concat([encryptionKey, Buffer.from(CRYPTO.VERIFICATION_STRING)]))
    .digest('hex')
}

// ─── Salt Generation ────────────────────────────────────

export function generateSalt(): Buffer {
  return randomBytes(CRYPTO.SALT_SIZE)
}
