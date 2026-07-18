import { CRYPTO } from './constants'

export interface EncryptedPayload {
  iv: string
  ciphertext: string
  authTag: string
}

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

// Convert string to Uint8Array
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

// Convert Uint8Array to string
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

// Generate random bytes
function randomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size))
}

// Import key for AES-GCM
async function importKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    key.slice().buffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

// Encrypt using Web Crypto API
export async function encrypt(plaintext: string, key: Uint8Array): Promise<EncryptedPayload> {
  const iv = randomBytes(CRYPTO.IV_SIZE)
  const cryptoKey = await importKey(key)
  const plaintextBytes = stringToBytes(plaintext)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.slice().buffer },
    cryptoKey,
    plaintextBytes.slice().buffer
  )

  // Split encrypted data and auth tag
  const encryptedBytes = new Uint8Array(encrypted)
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - CRYPTO.AUTH_TAG_SIZE)
  const authTag = encryptedBytes.slice(encryptedBytes.length - CRYPTO.AUTH_TAG_SIZE)

  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ciphertext),
    authTag: bytesToHex(authTag),
  }
}

// Decrypt using Web Crypto API
export async function decrypt(payload: EncryptedPayload, key: Uint8Array): Promise<string> {
  const iv = hexToBytes(payload.iv)
  const ciphertext = hexToBytes(payload.ciphertext)
  const authTag = hexToBytes(payload.authTag)

  // Combine ciphertext and auth tag
  const encryptedData = new Uint8Array(ciphertext.length + authTag.length)
  encryptedData.set(ciphertext)
  encryptedData.set(authTag, ciphertext.length)

  const cryptoKey = await importKey(key)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.slice().buffer },
    cryptoKey,
    encryptedData.slice().buffer
  )

  return bytesToString(new Uint8Array(decrypted))
}

// Encrypt JSON
export async function encryptJSON(data: unknown, key: Uint8Array): Promise<EncryptedPayload> {
  return encrypt(JSON.stringify(data), key)
}

// Decrypt JSON
export async function decryptJSON<T = unknown>(payload: EncryptedPayload, key: Uint8Array): Promise<T> {
  return JSON.parse(await decrypt(payload, key)) as T
}

// Export for Node.js compatibility (Buffer-based)
export function encryptSync(plaintext: string, key: Buffer): EncryptedPayload {
  // This is a placeholder - actual implementation should use the async version
  throw new Error('Use encrypt() for Web Crypto API')
}

export function decryptSync(payload: EncryptedPayload, key: Buffer): string {
  // This is a placeholder - actual implementation should use the async version
  throw new Error('Use decrypt() for Web Crypto API')
}
