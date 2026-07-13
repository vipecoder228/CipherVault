// ─── Entry Types ────────────────────────────────────────

export type EntryType = 'login' | 'secure_note' | 'card' | 'identity'

export interface CreateEntryPayload {
  entry_type: EntryType
  title: string
  username?: string
  password?: string
  url?: string
  notes?: string
  category_id?: number
  is_favorite?: boolean
  totp_secret?: string
  // Card fields
  card_number?: string
  card_holder?: string
  card_expiry?: string
  card_cvv?: string
}

export interface UpdateEntryPayload {
  title?: string
  username?: string
  password?: string
  url?: string
  notes?: string
  category_id?: number
  is_favorite?: boolean
  totp_secret?: string
  card_number?: string
  card_holder?: string
  card_expiry?: string
  card_cvv?: string
}

export interface DecryptedEntry {
  id: number
  entry_type: EntryType
  title: string
  username: string
  password: string
  url: string
  notes: string
  category_id: number | null
  is_favorite: number
  totp_secret: string
  card_number: string
  card_holder: string
  card_expiry: string
  card_cvv: string
  created_at: string
  updated_at: string
}

export interface EncryptedEntry {
  id: number
  entry_type: EntryType
  encrypted_data: string
  iv: string
  auth_tag: string
  display_title: string
  category_id: number | null
  is_favorite: number
  created_at: string
  updated_at: string
}

// ─── Entry Filters ──────────────────────────────────────

export interface EntryFilters {
  category_id?: number | null
  is_favorite?: boolean
  search?: string
  entry_type?: EntryType
}

// ─── Category ───────────────────────────────────────────

export interface Category {
  id: number
  name: string
  icon: string
  color: string
  sort_order: number
  created_at: string
}

export interface CreateCategoryPayload {
  name: string
  icon?: string
  color?: string
}

// ─── Vault ──────────────────────────────────────────────

export interface VaultStatus {
  locked: boolean
  initialized: boolean
  activeVaultId: number
  vaults: Array<{ id: number; displayName: string }>
}

export interface VaultSetupResult {
  success: boolean
  error?: string
  vaultId?: number
}

export interface VaultUnlockResult {
  success: boolean
  error?: string
  requiresTotp?: boolean
  alarmMode?: boolean
}

// ─── Password Generator ─────────────────────────────────

export interface PasswordOptions {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
}

// ─── Breach Check ───────────────────────────────────────

export interface BreachCheckResult {
  breached: boolean
  count: number
}

// ─── Import/Export ──────────────────────────────────────

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

// ─── Entry History ──────────────────────────────────────

export interface EntryHistoryItem {
  id: number
  entry_id: number
  change_type: 'create' | 'update' | 'delete'
  changed_at: string
}

// ─── IPC Channels ───────────────────────────────────────

export interface IPCChannels {
  // Vault
  'vault:status': () => VaultStatus
  'vault:setup': (masterPassword: string, alarmPassword?: string, displayName?: string) => Promise<VaultSetupResult>
  'vault:unlock': (masterPassword: string, totpCode?: string, vaultId?: number) => Promise<VaultUnlockResult>
  'vault:lock': () => void
  'vault:switch': (vaultId: number) => Promise<{ success: boolean; error?: string }>
  'vault:change-master-password': (oldPassword: string, newPassword: string, totpCode?: string) => Promise<VaultSetupResult>
  'vault:enable-totp': () => Promise<{ secret: string; qrCodeUrl: string }>
  'vault:verify-totp': (code: string) => Promise<boolean>
  'vault:disable-totp': (totpCode: string) => Promise<boolean>
  'vault:setup-alarm': (alarmPassword: string) => Promise<VaultSetupResult>
  'vault:change-alarm': (oldAlarm: string, newAlarm: string) => Promise<VaultSetupResult>
  'vault:remove-alarm': () => Promise<VaultSetupResult>

  // Entries
  'entries:list': (filters?: EntryFilters) => Promise<EncryptedEntry[]>
  'entries:get': (id: number) => Promise<DecryptedEntry | null>
  'entries:create': (data: CreateEntryPayload) => Promise<EncryptedEntry>
  'entries:update': (id: number, data: UpdateEntryPayload) => Promise<void>
  'entries:delete': (id: number) => Promise<void>
  'entries:search': (query: string, filters?: EntryFilters) => Promise<EncryptedEntry[]>
  'entries:toggle-favorite': (id: number) => Promise<void>
  'entries:get-history': (id: number) => Promise<EntryHistoryItem[]>
  'entries:get-decrypted-history': (id: number) => Promise<Array<EntryHistoryItem & { decrypted: Record<string, string> | null }>>
  'entries:get-totp': (id: number) => Promise<string | null>

  // Password
  'password:generate': (options: PasswordOptions) => string
  'password:check-breach': (password: string) => Promise<BreachCheckResult>

  // Categories
  'categories:list': () => Promise<Category[]>
  'categories:create': (data: CreateCategoryPayload) => Promise<Category>
  'categories:update': (id: number, data: Partial<CreateCategoryPayload>) => Promise<void>
  'categories:delete': (id: number) => Promise<void>
  'categories:reorder': (ids: number[]) => Promise<void>

  // Clipboard
  'clipboard:copy': (text: string, ttl?: number) => Promise<void>
  'clipboard:clear': () => Promise<void>

  // Settings
  'settings:get': (key: string) => Promise<string | null>
  'settings:set': (key: string, value: string) => Promise<void>

  // Disposable Emails
  'disposable:create': () => Promise<{ id: number; address: string }>
  'disposable:list': () => Promise<Array<{ id: number; address: string; createdAt: string }>>
  'disposable:messages': (emailId: number) => Promise<Array<{ id: string; from: string; subject: string; intro: string; createdAt: string; size: number }>>
  'disposable:message': (emailId: number, messageId: string) => Promise<{ id: string; from: string; subject: string; text: string; html: string; createdAt: string }>
  'disposable:delete-message': (emailId: number, messageId: string) => Promise<void>
  'disposable:delete-account': (emailId: number) => Promise<void>

  // Backup
  'backup:export': (backupPassword: string) => Promise<{ success: boolean; path?: string; error?: string }>
  'backup:import': (backupPassword: string, filePath?: string) => Promise<{ success: boolean; error?: string }>

  // Password Health
  'health:analyze': () => Promise<PasswordHealth>

  // Generators
  'password:generate-username': () => string
  'password:generate-passphrase': (wordCount?: number) => string

  // Import/Export
  'import:csv': (filePath?: string) => Promise<ImportResult>
  'import:json': (filePath?: string) => Promise<ImportResult>
  'export:csv': (filePath?: string, entryIds?: number[]) => Promise<{ success: boolean } | void>
  'export:json': (filePath?: string, entryIds?: number[]) => Promise<{ success: boolean } | void>
}

export type IPCChannel = keyof IPCChannels

// ─── Settings Keys ──────────────────────────────────────

export type SettingsKey =
  | 'auto_lock_ms'
  | 'clipboard_ttl_ms'
  | 'theme'
  | 'default_view'
  | 'font_size'
  | 'show_icons'

// ─── Password Health ─────────────────────────────────────

export interface PasswordHealth {
  total: number
  weak: number
  reused: number
  old: number
  exposed: number
  score: number
  details: PasswordHealthItem[]
}

export interface PasswordHealthItem {
  entryId: number
  title: string
  issues: string[]
}
