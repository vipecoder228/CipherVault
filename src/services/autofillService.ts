// Autofill Service
// Provides credential management and quick access for Android
// Full native autofill requires Android AutofillService (native development)

import { isCapacitor, isElectron } from '../../shared/bridge'
import { invoke, copyWithTtl } from '../lib/ipc'

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
  // New methods for quick access
  searchCredentials(query: string): Promise<AutofillEntry[]>
  getCredentialById(id: string): Promise<AutofillEntry | null>
  copyPassword(entryId: string): Promise<boolean>
  copyUsername(entryId: string): Promise<boolean>
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

// ─── Credential Storage ────────────────────────────────

interface StoredCredential {
  id: string
  title: string
  username: string
  password: string // Encrypted in vault, decrypted here for display
  url: string
  packageName?: string
  lastUsed: number
  useCount: number
}

// In-memory cache for quick access
let credentialCache: StoredCredential[] = []
let cacheLoaded = false

async function loadCredentials(): Promise<StoredCredential[]> {
  if (cacheLoaded) return credentialCache

  try {
    const entries = await invoke('entries:list', { entry_type: 'login' }) as any[]
    credentialCache = entries.map((entry: any) => ({
      id: String(entry.id),
      title: entry.display_title || 'Untitled',
      username: entry.username || '',
      password: entry.password || '',
      url: entry.url || entry.display_url || '',
      packageName: entry.package_name,
      lastUsed: entry.updated_at ? new Date(entry.updated_at).getTime() : 0,
      useCount: entry.use_count || 0,
    }))
    cacheLoaded = true
    return credentialCache
  } catch {
    return []
  }
}

function invalidateCache(): void {
  credentialCache = []
  cacheLoaded = false
}

// ─── Capacitor Autofill ────────────────────────────────

const capacitorAutofill: AutofillService = {
  async isAvailable(): Promise<boolean> {
    // Native autofill requires Android AutofillService
    // For now, we support credential management and quick access
    return true
  },

  async isEnabled(): Promise<boolean> {
    try {
      const enabled = await invoke('settings:get', 'autofill_enabled') as string
      return enabled === 'true'
    } catch {
      return false
    }
  },

  async enable(): Promise<void> {
    await invoke('settings:set', 'autofill_enabled', 'true')
  },

  async disable(): Promise<void> {
    await invoke('settings:set', 'autofill_enabled', 'false')
  },

  async getSuggestions(url: string, packageName: string): Promise<AutofillSuggestion[]> {
    const credentials = await loadCredentials()
    const suggestions: AutofillSuggestion[] = []

    for (const cred of credentials) {
      if (cred.url && domainsMatch(cred.url, url)) {
        suggestions.push({
          id: cred.id,
          title: cred.title,
          subtitle: cred.username,
          username: cred.username,
        })
      }
      // Also match by package name if provided
      if (packageName && cred.packageName && cred.packageName === packageName) {
        suggestions.push({
          id: cred.id,
          title: cred.title,
          subtitle: cred.username,
          username: cred.username,
        })
      }
    }

    // Sort by last used (most recent first)
    suggestions.sort((a, b) => {
      const credA = credentials.find(c => c.id === a.id)
      const credB = credentials.find(c => c.id === b.id)
      return (credB?.lastUsed || 0) - (credA?.lastUsed || 0)
    })

    return suggestions.slice(0, 5) // Limit to 5 suggestions
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    // Native autofill requires Android AutofillService
    // For now, copy password to clipboard
    return this.copyPassword(entryId)
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    // Credentials are stored in vault entries
    // This method is for compatibility with autofill frameworks
    invalidateCache()
    return true
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    const credentials = await loadCredentials()
    return credentials
      .filter(cred => cred.url && domainsMatch(cred.url, url))
      .map(cred => ({
        id: cred.id,
        title: cred.title,
        username: cred.username,
        password: cred.password,
        url: cred.url,
        packageName: cred.packageName,
      }))
  },

  async searchCredentials(query: string): Promise<AutofillEntry[]> {
    const credentials = await loadCredentials()
    const lowerQuery = query.toLowerCase()

    return credentials
      .filter(cred =>
        cred.title.toLowerCase().includes(lowerQuery) ||
        cred.username.toLowerCase().includes(lowerQuery) ||
        cred.url.toLowerCase().includes(lowerQuery)
      )
      .map(cred => ({
        id: cred.id,
        title: cred.title,
        username: cred.username,
        password: cred.password,
        url: cred.url,
        packageName: cred.packageName,
      }))
  },

  async getCredentialById(id: string): Promise<AutofillEntry | null> {
    const credentials = await loadCredentials()
    const cred = credentials.find(c => c.id === id)
    if (!cred) return null

    return {
      id: cred.id,
      title: cred.title,
      username: cred.username,
      password: cred.password,
      url: cred.url,
      packageName: cred.packageName,
    }
  },

  async copyPassword(entryId: string): Promise<boolean> {
    try {
      const entry = await this.getCredentialById(entryId)
      if (!entry) return false

      // Copy password to clipboard
      await copyWithTtl(entry.password)

      // Update last used time
      invalidateCache()
      return true
    } catch {
      return false
    }
  },

  async copyUsername(entryId: string): Promise<boolean> {
    try {
      const entry = await this.getCredentialById(entryId)
      if (!entry) return false

      // Copy username to clipboard
      await copyWithTtl(entry.username)

      return true
    } catch {
      return false
    }
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
    return capacitorAutofill.getSuggestions(url, packageName)
  },

  async fillCredentials(entryId: string): Promise<boolean> {
    return capacitorAutofill.fillCredentials(entryId)
  },

  async saveCredentials(entry: AutofillEntry): Promise<boolean> {
    return capacitorAutofill.saveCredentials(entry)
  },

  async matchUrl(url: string): Promise<AutofillEntry[]> {
    return capacitorAutofill.matchUrl(url)
  },

  async searchCredentials(query: string): Promise<AutofillEntry[]> {
    return capacitorAutofill.searchCredentials(query)
  },

  async getCredentialById(id: string): Promise<AutofillEntry | null> {
    return capacitorAutofill.getCredentialById(id)
  },

  async copyPassword(entryId: string): Promise<boolean> {
    return capacitorAutofill.copyPassword(entryId)
  },

  async copyUsername(entryId: string): Promise<boolean> {
    return capacitorAutofill.copyUsername(entryId)
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

  async searchCredentials(query: string): Promise<AutofillEntry[]> {
    return []
  },

  async getCredentialById(id: string): Promise<AutofillEntry | null> {
    return null
  },

  async copyPassword(entryId: string): Promise<boolean> {
    return false
  },

  async copyUsername(entryId: string): Promise<boolean> {
    return false
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
