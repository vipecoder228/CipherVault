// ─── Vault Adapter Interfaces ────────────────────────────
// Platform-agnostic interfaces for crypto and database operations.
// Electron and Web each provide their own implementations.

export interface EncryptedPayload {
  iv: string
  ciphertext: string
  authTag: string
}

export interface CryptoAdapter {
  deriveKey(password: string, salt: Uint8Array, type?: 'argon2id' | 'pbkdf2'): Promise<Uint8Array>
  splitDerivedKey(key: Uint8Array): { encryptionKey: Uint8Array; hmacKey: Uint8Array }
  computeVerificationHash(encryptionKey: Uint8Array): Promise<string>
  generateSalt(): Uint8Array
  encrypt(plaintext: string, key: Uint8Array): Promise<EncryptedPayload>
  decrypt(payload: EncryptedPayload, key: Uint8Array): Promise<string>
  encryptJSON(data: unknown, key: Uint8Array): Promise<EncryptedPayload>
  decryptJSON<T = unknown>(payload: EncryptedPayload, key: Uint8Array): Promise<T>
  timingSafeEqual(a: string, b: string): boolean
  generateTOTPSecret(): string
  verifyTOTP(secret: string, token: string): Promise<boolean>
  generateTOTPCode(secret: string): Promise<string>
  generateQRCodeUrl(secret: string, username?: string): string
}

export interface VaultRow {
  id: number
  kdf_salt: string
  master_hash: string
  verification_hash: string
  totp_secret: string | null
  totp_enabled: number
  alarm_hash: string | null
  alarm_salt: string | null
  display_name: string
  kdf_type?: string
}

export interface DBAdapter {
  getVault(vaultId?: number): Promise<VaultRow | null>
  getAllVaults(): Promise<VaultRow[]>
  createVault(kdfSalt: string, masterHash: string, verificationHash: string, displayName: string, alarmHash?: string, alarmSalt?: string): Promise<number>
  updateMasterHash(vaultId: number, masterHash: string, verificationHash: string): Promise<void>
  updateTOTP(vaultId: number, secret: string | null, enabled: boolean): Promise<void>
  updateAlarm(vaultId: number, alarmHash: string | null, alarmSalt: string | null): Promise<void>
  updateDisplayName(vaultId: number, name: string): Promise<void>
  runQuery(sql: string, params?: unknown[]): Promise<void>
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  saveDatabase(): Promise<void>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
}

export interface EntryEncryptAdapter {
  reEncryptAllEntries(vaultId: number, oldKey: Uint8Array, newKey: Uint8Array): Promise<{ reEncrypted: number; errors: number }>
  reEncryptAllHistory(vaultId: number, oldKey: Uint8Array, newKey: Uint8Array): Promise<void>
  reEncryptAttachments(vaultId: number, oldKey: Uint8Array, newKey: Uint8Array): Promise<void>
}

export interface ClipboardAdapter {
  clear(): void
}

export interface VaultEnv {
  crypto: CryptoAdapter
  db: DBAdapter
  entryEncrypt: EntryEncryptAdapter
  clipboard: ClipboardAdapter
  emitEvent?: (event: string) => void
}
