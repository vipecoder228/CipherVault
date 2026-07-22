// Biometric authentication service
// Provides fingerprint/Face ID authentication for mobile devices

import { isCapacitor, isElectron } from '../../shared/bridge'

export interface BiometricResult {
  success: boolean
  error?: string
}

export interface BiometricService {
  isAvailable(): Promise<boolean>
  authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult>
  enable(): Promise<void>
  disable(): Promise<void>
  isEnabled(): Promise<boolean>
}

// Capacitor biometric implementation using @capgo/capacitor-native-biometric
const capacitorBiometric: BiometricService = {
  async isAvailable(): Promise<boolean> {
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
      const result = await NativeBiometric.isAvailable({ useFallback: true })
      return result.isAvailable
    } catch {
      return false
    }
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult> {
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
      await NativeBiometric.verifyIdentity({
        title,
        subtitle,
        reason,
        negativeButtonText: 'Отмена',
        useFallback: true,
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'Authentication failed' }
    }
  },

  async enable(): Promise<void> {
    localStorage.setItem('biometric_enabled', 'true')
  },

  async disable(): Promise<void> {
    localStorage.removeItem('biometric_enabled')
  },

  async isEnabled(): Promise<boolean> {
    return localStorage.getItem('biometric_enabled') === 'true'
  },
}

// Electron biometric implementation (not yet available)
const electronBiometric: BiometricService = {
  async isAvailable(): Promise<boolean> {
    return false
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult> {
    return { success: false, error: 'Biometric authentication not available on Electron' }
  },

  async enable(): Promise<void> {},
  async disable(): Promise<void> {},
  async isEnabled(): Promise<boolean> { return false },
}

// Web fallback (no biometric support)
const webBiometric: BiometricService = {
  async isAvailable(): Promise<boolean> {
    return false
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult> {
    return { success: false, error: 'Biometric authentication not available on web' }
  },

  async enable(): Promise<void> {},
  async disable(): Promise<void> {},
  async isEnabled(): Promise<boolean> { return false },
}

// Get the appropriate biometric service based on platform
export function getBiometricService(): BiometricService {
  if (isCapacitor) return capacitorBiometric
  if (isElectron) return electronBiometric
  return webBiometric
}

let biometricService: BiometricService | null = null

export function getBiometric(): BiometricService {
  if (!biometricService) {
    biometricService = getBiometricService()
  }
  return biometricService
}

export default getBiometric
