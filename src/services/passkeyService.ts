// Passkey/FIDO2 Service
// Manages WebAuthn passkeys for passwordless authentication
// Stores passkey metadata in the encrypted vault

import { invoke } from '../lib/ipc'

export interface PasskeyCredential {
  id: string
  publicKey: string // Base64 encoded
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

// ─── Helpers ──────────────────────────────────────────

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

      // Create passkey credential with base64 public key
      const passkey: PasskeyCredential = {
        id: credential.id,
        publicKey: arrayBufferToBase64(attestationResponse.getPublicKey()!),
        counter: 0,
        rpName: options.rpName,
        rpId: options.rpId,
        userName: options.userName,
        userDisplayName: options.userDisplayName,
        createdAt: Date.now(),
      }

      // Save to vault via IPC
      await invoke('passkey:save' as any, passkey)

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

      // Update counter in vault
      const stored = await invoke('passkey:get' as any, assertion.id) as PasskeyCredential | null
      if (stored) {
        await invoke('passkey:update-counter' as any, assertion.id, stored.counter + 1)
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
    return invoke('passkey:get' as any, credentialId) as Promise<PasskeyCredential | null>
  },

  async listCredentials(): Promise<PasskeyCredential[]> {
    return invoke('passkey:list' as any) as Promise<PasskeyCredential[]>
  },

  async deleteCredential(credentialId: string): Promise<boolean> {
    return invoke('passkey:delete' as any, credentialId) as Promise<boolean>
  },
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

export { base64ToArrayBuffer, arrayBufferToBase64 }

export default getPasskey
