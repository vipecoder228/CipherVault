// NOTE: shared/crypto/constants.ts has the Web Crypto equivalents
// (DIGEST: 'sha-256', ENCRYPTION_ALGO: 'AES-GCM')
// Both files must keep the same numeric values for PBKDF2, SALT_SIZE, IV_SIZE, AUTH_TAG_SIZE, etc.
export const CRYPTO = {
  // Argon2id parameters (OWASP recommended)
  ARGON2: {
    TIME_COST: 3,        // iterations
    MEMORY_COST: 65536,  // 64 MB
    PARALLELISM: 4,      // threads
    KEY_LENGTH: 32,      // bytes
    SALT_LENGTH: 16,     // bytes
  },
  // Legacy PBKDF2 (kept for migration)
  PBKDF2: {
    ITERATIONS: 600_000,
    KEY_LENGTH: 64,
    DIGEST: 'sha256' as const,
  },
  SALT_SIZE: 32,
  IV_SIZE: 12,  // GCM recommended
  AUTH_TAG_SIZE: 16,
  VERIFICATION_STRING: 'vault-verify',
  ENCRYPTION_ALGO: 'aes-256-gcm' as const,
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
  SESSION_TIMEOUT_MS: 900_000, // 15 min inactivity timeout
}

// HMAC key for audit log integrity (generated once, stored in keychain)
// Used to sign audit log entries so tampering is detectable
export const HMAC_KEY_NAME = 'audit_hmac_key'
