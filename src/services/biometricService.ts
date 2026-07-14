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

// Check if Capacitor is available
const capacitor = typeof window !== 'undefined' ? (window as any).Capacitor : null

// Capacitor biometric implementation
const capacitorBiometric: BiometricService = {
  async isAvailable(): Promise<boolean> {
    if (!capacitor) return false

    try {
      // Check if Biometric plugin is available
      const { Biometric } = await import('@capacitor-community/biometric')
      const result = await Biometric.isAvailable()
      return result.isAvailable
    } catch {
      return false
    }
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult> {
    if (!capacitor) {
      return { success: false, error: 'Capacitor not available' }
    }

    try {
      const { Biometric } = await import('@capacitor-community/biometric')
      const result = await Biometric.authenticate({
        title,
        subtitle,
        reason,
        cancelTitle: 'Отмена',
      })

      return { success: result.success }
    } catch (error: any) {
      return { success: false, error: error.message || 'Authentication failed' }
    }
  },

  async enable(): Promise<void> {
    // Store preference
    localStorage.setItem('biometric_enabled', 'true')
  },

  async disable(): Promise<void> {
    localStorage.removeItem('biometric_enabled')
  },

  async isEnabled(): Promise<boolean> {
    return localStorage.getItem('biometric_enabled') === 'true'
  },
}

// Electron biometric implementation (placeholder)
const electronBiometric: BiometricService = {
  async isAvailable(): Promise<boolean> {
    // TODO: Implement with native keychain integration
    return false
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult> {
    // TODO: Implement with native keychain integration
    return { success: true }
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

// Web fallback (no biometric support)
const webBiometric: BiometricService = {
  async isAvailable(): Promise<boolean> {
    return false
  },

  async authenticate(title: string, subtitle: string, reason: string): Promise<BiometricResult> {
    return { success: true }
  },

  async enable(): Promise<void> {
    // No-op on web
  },

  async disable(): Promise<void> {
    // No-op on web
  },

  async isEnabled(): Promise<boolean> {
    return false
  },
}

// Get the appropriate biometric service based on platform
export function getBiometricService(): BiometricService {
  if (isCapacitor) {
    return capacitorBiometric
  }
  if (isElectron) {
    return electronBiometric
  }
  return webBiometric
}

// Singleton instance
let biometricService: BiometricService | null = null

export function getBiometric(): BiometricService {
  if (!biometricService) {
    biometricService = getBiometricService()
  }
  return biometricService
}

export default getBiometric
