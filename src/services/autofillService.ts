// Autofill Service
// Provides credential autofill for Android apps and browsers
// Native Android Autofill requires @aparajita/capacitor-native-autofill or similar plugin

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

// ─── URL Matching Logic ────────────────────────────────

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return url.toLowerCase()
  }
}

function domainsMatch(storedUrl: string, targetUrl: string): boolean {
  const stored = extractDomain(storedUrl)
  const target = extractDomain(targetUrl)

  if (!stored || !target) return false

  // Exact match
  if (stored === target) return true

  // Subdomain match: stored ends with .target or is subdomain of target
  if (target.endsWith('.' + stored) || stored.endsWith('.' + target)) return true

  // Partial match: one contains the other
  if (stored.includes(target) || target.includes(stored)) return true

  return false
}

// ─── Capacitor Autofill ────────────────────────────────

const capacitorAutofill: AutofillService = {
  async isAvailable(): Promise<boolean> {
    // Native Android Autofill requires a Capacitor plugin.
    // Check if the plugin is installed by trying to import it.
    try {
      // @ts-ignore - optional peer dependency
      const mod = await import('@aparajita/capacitor-native-autofill')
      return !!mod?.AutofillCredentialsManager
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
    // Without native plugin, return empty
    // With plugin: query vault for matching credentials
    return []
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    // Without native plugin, cannot fill
    return false
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    // Without native plugin, cannot save
    return false
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    // URL matching is done at the UI level via webBackend/searchEntries
    return []
  },
}

// ─── Electron Autofill (browser extension based) ───────

const electronAutofill: AutofillService = {
  async isAvailable(): Promise<boolean> {
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
    // Electron uses browser extension for autofill
    // The extension handles suggestions via WebSocket
    return []
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    // Electron uses browser extension for autofill
    return false
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    return false
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    return []
  },
}

// ─── Web Fallback (no autofill support) ────────────────

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

// ─── Factory ───────────────────────────────────────────

export function getAutofillService(): AutofillService {
  if (isCapacitor) return capacitorAutofill
  if (isElectron) return electronAutofill
  return webAutofill
}

let autofillService: AutofillService | null = null

export function getAutofill(): AutofillService {
  if (!autofillService) {
    autofillService = getAutofillService()
  }
  return autofillService
}

// Export URL matching for use by other modules
export { domainsMatch, extractDomain }

export default getAutofill
