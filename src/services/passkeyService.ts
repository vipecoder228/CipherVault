// Passkey/FIDO2 Service
// Manages WebAuthn passkeys for passwordless authentication

export interface PasskeyCredential {
  id: string
  publicKey: ArrayBuffer
  counter: number
  rpName: string
  rpId: string
  userName: string
  userDisplayName: string
  createdAt: number
}

export interface PasskeyCreationOptions {
  rpName: string
  rpId: string
  userName: string
  userDisplayName: string
  challenge: ArrayBuffer
  timeout?: number
}

export interface PasskeyRequestOptions {
  rpId: string
  challenge: ArrayBuffer
  allowCredentials?: Array<{ id: ArrayBuffer; type: 'public-key' }>
  timeout?: number
}

export interface PasskeyService {
  isAvailable(): Promise<boolean>
  createCredential(options: PasskeyCreationOptions): Promise<PasskeyCredential | null>
  authenticate(options: PasskeyRequestOptions): Promise<{ credentialId: ArrayBuffer; authenticatorData: ArrayBuffer; clientDataJSON: ArrayBuffer; signature: ArrayBuffer } | null>
  getCredential(credentialId: string): Promise<PasskeyCredential | null>
  listCredentials(): Promise<PasskeyCredential[]>
  deleteCredential(credentialId: string): Promise<boolean>
}

// ─── WebAuthn Implementation ──────────────────────────

const webAuthnPasskey: PasskeyService = {
  async isAvailable(): Promise<boolean> {
    return !!(window.PublicKeyCredential && navigator.credentials)
  },

  async createCredential(options: PasskeyCreationOptions): Promise<PasskeyCredential | null> {
    try {
      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: options.challenge,
        rp: {
          name: options.rpName,
          id: options.rpId,
        },
        user: {
          id: new TextEncoder().encode(options.userName),
          name: options.userName,
          displayName: options.userDisplayName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: options.timeout || 60000,
        attestation: 'none',
      }

      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null
      if (!credential) return null

      const attestationResponse = credential.response as AuthenticatorAttestationResponse

      // Store credential
      const passkey: PasskeyCredential = {
        id: credential.id,
        publicKey: attestationResponse.getPublicKey()!,
        counter: 0,
        rpName: options.rpName,
        rpId: options.rpId,
        userName: options.userName,
        userDisplayName: options.userDisplayName,
        createdAt: Date.now(),
      }

      // Save to localStorage (in production, save to vault)
      const credentials = getStoredCredentials()
      credentials.push(passkey)
      localStorage.setItem('passkey_credentials', JSON.stringify(credentials.map(c => ({
        ...c,
        publicKey: arrayBufferToBase64(c.publicKey),
      }))))

      return passkey
    } catch (error) {
      console.error('Passkey creation failed:', error)
      return null
    }
  },

  async authenticate(options: PasskeyRequestOptions): Promise<{
    credentialId: ArrayBuffer
    authenticatorData: ArrayBuffer
    clientDataJSON: ArrayBuffer
    signature: ArrayBuffer
  } | null> {
    try {
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: options.challenge,
        rpId: options.rpId,
        timeout: options.timeout || 60000,
        userVerification: 'required',
      }

      if (options.allowCredentials && options.allowCredentials.length > 0) {
        publicKey.allowCredentials = options.allowCredentials
      }

      const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
      if (!assertion) return null

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse

      // Update counter
      const credentials = getStoredCredentials()
      const stored = credentials.find(c => c.id === assertion.id)
      if (stored) {
        stored.counter++
        localStorage.setItem('passkey_credentials', JSON.stringify(credentials.map(c => ({
          ...c,
          publicKey: arrayBufferToBase64(c.publicKey),
        }))))
      }

      return {
        credentialId: assertion.rawId,
        authenticatorData: assertionResponse.authenticatorData,
        clientDataJSON: assertionResponse.clientDataJSON,
        signature: assertionResponse.signature,
      }
    } catch (error) {
      console.error('Passkey authentication failed:', error)
      return null
    }
  },

  async getCredential(credentialId: string): Promise<PasskeyCredential | null> {
    const credentials = getStoredCredentials()
    return credentials.find(c => c.id === credentialId) || null
  },

  async listCredentials(): Promise<PasskeyCredential[]> {
    return getStoredCredentials()
  },

  async deleteCredential(credentialId: string): Promise<boolean> {
    const credentials = getStoredCredentials()
    const index = credentials.findIndex(c => c.id === credentialId)
    if (index === -1) return false
    credentials.splice(index, 1)
    localStorage.setItem('passkey_credentials', JSON.stringify(credentials.map(c => ({
      ...c,
      publicKey: arrayBufferToBase64(c.publicKey),
    }))))
    return true
  },
}

// ─── Helpers ──────────────────────────────────────────

function getStoredCredentials(): PasskeyCredential[] {
  try {
    const stored = localStorage.getItem('passkey_credentials')
    if (!stored) return []
    return JSON.parse(stored).map((c: any) => ({
      ...c,
      publicKey: base64ToArrayBuffer(c.publicKey),
    }))
  } catch {
    return []
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ─── Fallback (no WebAuthn support) ───────────────────

const fallbackPasskey: PasskeyService = {
  async isAvailable(): Promise<boolean> { return false },
  async createCredential(): Promise<null> { return null },
  async authenticate(): Promise<null> { return null },
  async getCredential(): Promise<null> { return null },
  async listCredentials(): Promise<[]> { return [] },
  async deleteCredential(): Promise<boolean> { return false },
}

// ─── Factory ──────────────────────────────────────────

export function getPasskeyService(): PasskeyService {
  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    return webAuthnPasskey
  }
  return fallbackPasskey
}

let passkeyService: PasskeyService | null = null

export function getPasskey(): PasskeyService {
  if (!passkeyService) {
    passkeyService = getPasskeyService()
  }
  return passkeyService
}

export default getPasskey
