// Platform-agnostic crypto module
// Automatically uses Web Crypto API in browser/Capacitor, Node.js crypto in Electron

import * as webCrypto from './keyderivation'
import { encrypt, decrypt, encryptJSON, decryptJSON } from './encryption'
import { CRYPTO, RATE_LIMIT, DEFAULTS } from './constants'

// Export the appropriate implementation
export const cryptoModule = {
  // Constants
  CRYPTO,
  RATE_LIMIT,
  DEFAULTS,

  // Key derivation
  deriveKey: webCrypto.deriveKey,
  splitDerivedKey: webCrypto.splitDerivedKey,
  computeVerificationHash: webCrypto.computeVerificationHash,
  generateSalt: webCrypto.generateSalt,

  // Encryption/Decryption
  encrypt,
  decrypt,
  encryptJSON,
  decryptJSON,

  // Utilities
  timingSafeEqual: webCrypto.timingSafeEqual,
  fromHex: webCrypto.fromHex,
  toHex: webCrypto.toHex,
}

export type { EncryptedPayload } from './encryption'
export default cryptoModule
