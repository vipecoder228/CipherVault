// Android Autofill Service
// Provides credential autofill for Android apps and browsers

import { isCapacitor, isElectron } from '../../shared/bridge'

export interface AutofillEntry {
  id: string
  title: string
  username: string
  password: string
  url?: string
  packageName?: string
}

export interface AutofillSuggestion {
  id: string
  title: string
  subtitle: string
  username: string
}

export interface AutofillService {
  isAvailable(): Promise<boolean>
  isEnabled(): Promise<boolean>
  enable(): Promise<void>
  disable(): Promise<void>
  getSuggestions(url: string, packageName: string): Promise<AutofillSuggestion[]>
  fillCredentials(entryId: string): Promise<boolean>
  saveCredentials(entry: AutofillEntry): Promise<boolean>
  matchUrl(url: string): Promise<AutofillEntry[]>
}

// Capacitor Autofill implementation
const capacitorAutofill: AutofillService = {
  async isAvailable(): Promise<boolean> {
    // Check if Autofill plugin is available
    try {
      // TODO: Implement with native autofill plugin
      return false
    } catch {
      return false
    }
  },

  async isEnabled(): Promise<boolean> {
    return localStorage.getItem('autofill_enabled') === 'true'
  },

  async enable(): Promise<void> {
    localStorage.setItem('autofill_enabled', 'true')
  },

  async disable(): Promise<void> {
    localStorage.removeItem('autofill_enabled')
  },

  async getSuggestions(url: string, packageName: string): Promise<AutofillSuggestion[]> {
    // TODO: Implement with native autofill service
    // Match URL/package to stored credentials
    return []
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    // TODO: Implement with native autofill service
    return false
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    // TODO: Implement with native autofill service
    return false
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    // TODO: Implement URL matching
    return []
  },
}

// Electron Autofill implementation (browser extension based)
const electronAutofill: AutofillService = {
  async isAvailable(): Promise<boolean> {
    // Electron uses browser extension for autofill
    return true
  },

  async isEnabled(): Promise<boolean> {
    return localStorage.getItem('autofill_enabled') === 'true'
  },

  async enable(): Promise<void> {
    localStorage.setItem('autofill_enabled', 'true')
  },

  async disable(): Promise<void> {
    localStorage.removeItem('autofill_enabled')
  },

  async getSuggestions(url: string, packageName: string): Promise<AutofillSuggestion[]> {
    // TODO: Implement with browser extension communication
    return []
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    // TODO: Implement with browser extension communication
    return false
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    // TODO: Implement with browser extension communication
    return false
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    // TODO: Implement URL matching
    return []
  },
}

// Web fallback (no autofill support)
const webAutofill: AutofillService = {
  async isAvailable(): Promise<boolean> {
    return false
  },

  async isEnabled(): Promise<boolean> {
    return false
  },

  async enable(): Promise<void> {},

  async disable(): Promise<void> {},

  async getSuggestions(url: string, packageName: string): Promise<AutofillSuggestion[]> {
    return []
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    return false
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    return false
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    return []
  },
}

// Get the appropriate autofill service based on platform
export function getAutofillService(): AutofillService {
  if (isCapacitor) {
    return capacitorAutofill
  }
  if (isElectron) {
    return electronAutofill
  }
  return webAutofill
}

// Singleton instance
let autofillService: AutofillService | null = null

export function getAutofill(): AutofillService {
  if (!autofillService) {
    autofillService = getAutofillService()
  }
  return autofillService
}

export default getAutofill
