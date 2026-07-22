// Secure storage helpers for encrypting sensitive data in localStorage
// Used on web/mobile platforms where OS keychain is unavailable

// ─── Device-specific key ──────────────────────────────
// Used to encrypt secrets when master password is not available

export async function getDeviceKey(): Promise<string> {
  let deviceKey = localStorage.getItem('cv_device_key')
  if (!deviceKey) {
    const key = crypto.getRandomValues(new Uint8Array(32))
    deviceKey = btoa(String.fromCharCode(...key))
    localStorage.setItem('cv_device_key', deviceKey)
  }
  return deviceKey
}

// ─── Encrypt/Decrypt with key string ──────────────────

export async function encryptWithKey(data: string, keyStr: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(keyStr), c => c.charCodeAt(0)),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data)
  )
  const result = new Uint8Array(16 + 12 + encrypted.byteLength)
  result.set(salt, 0)
  result.set(iv, 16)
  result.set(new Uint8Array(encrypted), 28)
  return btoa(String.fromCharCode(...result))
}

export async function decryptWithKey(encryptedBase64: string, keyStr: string): Promise<string | null> {
  try {
    const data = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    if (data.length < 28 + 16) return null
    const salt = data.slice(0, 16)
    const iv = data.slice(16, 28)
    const ciphertext = data.slice(28)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      Uint8Array.from(atob(keyStr), c => c.charCodeAt(0)),
      'PBKDF2',
      false,
      ['deriveKey']
    )
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

// ─── Sync Password Encryption ─────────────────────────

let cachedMasterKey: string | null = null

export function setCachedMasterKey(key: string): void {
  cachedMasterKey = key
}

export function clearCachedMasterKey(): void {
  cachedMasterKey = null
}

async function encryptSyncPasswordInternal(password: string, keyStr: string): Promise<string> {
  return encryptWithKey(password, keyStr)
}

async function decryptSyncPasswordInternal(encryptedBase64: string, keyStr: string): Promise<string | null> {
  return decryptWithKey(encryptedBase64, keyStr)
}

export async function setSyncPasswordEncrypted(password: string): Promise<void> {
  const deviceKey = await getDeviceKey()
  const encrypted = await encryptSyncPasswordInternal(password, deviceKey)
  localStorage.setItem('sync_password_enc', encrypted)
  localStorage.removeItem('sync_password') // Remove old plaintext
}

export async function getSyncPasswordDecrypted(): Promise<string | null> {
  const enc = localStorage.getItem('sync_password_enc')
  if (enc) {
    const deviceKey = await getDeviceKey()
    const dec = await decryptSyncPasswordInternal(enc, deviceKey)
    if (dec) return dec
  }
  // Legacy: check old plaintext (will be re-encrypted on next set)
  const legacy = localStorage.getItem('sync_password')
  return legacy
}
