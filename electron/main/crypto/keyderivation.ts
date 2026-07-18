import { randomBytes, pbkdf2, createHash } from 'crypto'
import { CRYPTO } from './constants'

// ─── PBKDF2 Key Derivation (built into Node.js) ────────

export async function deriveKey(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(
      password,
      salt,
      CRYPTO.PBKDF2.ITERATIONS,
      CRYPTO.PBKDF2.KEY_LENGTH,
      CRYPTO.PBKDF2.DIGEST,
      (err, key) => {
        if (err) reject(err)
        else resolve(key)
      }
    )
  })
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
