// NOTE: electron/main/crypto/constants.ts has the Node.js equivalents
// (DIGEST: 'sha256', ENCRYPTION_ALGO: 'aes-256-gcm')
// Both files must keep the same numeric values for PBKDF2, SALT_SIZE, IV_SIZE, AUTH_TAG_SIZE, etc.
export const CRYPTO = {
  PBKDF2: {
    ITERATIONS: 600_000,
    KEY_LENGTH: 64,
    DIGEST: 'sha-256' as const,
  },
  SALT_SIZE: 32,
  IV_SIZE: 12,  // GCM recommended
  AUTH_TAG_SIZE: 16,
  VERIFICATION_STRING: 'vault-verify',
  ENCRYPTION_ALGO: 'AES-GCM' as const,
} as const

export const RATE_LIMIT = {
  ATTEMPTS_BEFORE_DELAY_1: 4,
  ATTEMPTS_BEFORE_DELAY_2: 6,
  ATTEMPTS_BEFORE_DELAY_3: 8,
  ATTEMPTS_BEFORE_LOCK: 10,
  DELAY_1_MS: 5_000,
  DELAY_2_MS: 30_000,
  DELAY_3_MS: 300_000,
  WINDOW_MS: 300_000, // 5 min window for counting attempts
} as const

export const DEFAULTS = {
  AUTO_LOCK_MS: 300_000,    // 5 min
  CLIPBOARD_TTL_MS: 30_000, // 30 sec
  THEME: 'dark' as const,
  DEFAULT_VIEW: 'list' as const,
}
