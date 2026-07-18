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
  // Identity fields
  identity_first_name?: string
  identity_last_name?: string
  identity_phone?: string
  identity_email?: string
  identity_address?: string
  identity_ssn?: string
  identity_passport?: string
  identity_birthdate?: string
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
  identity_first_name?: string
  identity_last_name?: string
  identity_phone?: string
  identity_email?: string
  identity_address?: string
  identity_ssn?: string
  identity_passport?: string
  identity_birthdate?: string
}

export interface DecryptedEntry {
  id: number
  entry_type: EntryType
  title: string
  display_title: string
  username: string
  password: string
  url: string
  notes: string
  category_id: number | null
  is_favorite: boolean
  totp_secret: string
  card_number: string
  card_holder: string
  card_expiry: string
  card_cvv: string
  identity_first_name: string
  identity_last_name: string
  identity_phone: string
  identity_email: string
  identity_address: string
  identity_ssn: string
  identity_passport: string
  identity_birthdate: string
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
  vault_id: number
  deleted_at: string | null
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
  'vault:status': () => Promise<VaultStatus>
  'vault:setup': (masterPassword: string, alarmPassword?: string, displayName?: string) => Promise<VaultSetupResult>
  'vault:create': (masterPassword: string, displayName: string) => Promise<VaultSetupResult>
  'vault:unlock': (masterPassword: string, totpCode?: string, vaultId?: number) => Promise<VaultUnlockResult>
  'vault:lock': () => Promise<void>
  'vault:switch': (vaultId: number) => Promise<{ success: boolean; error?: string }>
  'vault:change-master-password': (oldPassword: string, newPassword: string, totpCode?: string) => Promise<VaultSetupResult>
  'vault:enable-totp': () => Promise<{ secret: string; qrCodeUrl: string }>
  'vault:verify-totp': (code: string) => Promise<boolean>
  'vault:disable-totp': (totpCode: string) => Promise<boolean>
  'vault:setup-alarm': (alarmPassword: string) => Promise<VaultSetupResult>
  'vault:change-alarm': (oldAlarm: string, newAlarm: string) => Promise<VaultSetupResult>
  'vault:remove-alarm': () => Promise<VaultSetupResult>
  'vault:verify-password': (password: string) => Promise<boolean>

  // Entries
  'entries:list': (filters?: EntryFilters) => Promise<EncryptedEntry[]>
  'entries:get': (id: number) => Promise<DecryptedEntry | null>
  'entries:create': (data: CreateEntryPayload) => Promise<EncryptedEntry>
  'entries:update': (id: number, data: UpdateEntryPayload) => Promise<void>
  'entries:delete': (id: number) => Promise<void>
  'entries:restore': (id: number) => Promise<void>
  'entries:permanent-delete': (id: number) => Promise<void>
  'entries:deleted': () => Promise<EncryptedEntry[]>
  'entries:cleanup-old': () => Promise<number>
  'entries:search': (query: string, filters?: EntryFilters) => Promise<EncryptedEntry[]>
  'entries:toggle-favorite': (id: number) => Promise<void>
  'entries:get-history': (id: number) => Promise<EntryHistoryItem[]>
  'entries:get-decrypted-history': (id: number) => Promise<Array<EntryHistoryItem & { decrypted: Record<string, string> | null }>>
  'entries:get-totp': (id: number) => Promise<string | null>

  // Password
  'password:generate': (options: PasswordOptions) => Promise<string>
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
  'settings:set-secure': (key: string, value: string) => Promise<void>
  'settings:get-secure': (key: string) => Promise<string | null>

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
  'backup:import-panic': (backupPassword: string, filePath?: string) => Promise<{ success: boolean; error?: string; imported?: number; skipped?: number; errors?: string[] }>

  // Password Health
  'health:analyze': () => Promise<PasswordHealth>

  // Generators
  'password:generate-username': () => Promise<string>
  'password:generate-passphrase': (wordCount?: number) => Promise<string>

  // Sync
  'sync:get-status': () => Promise<{ enabled: boolean; folder: string | null; lastSyncTime: number; isSyncing: boolean }>
  'sync:select-folder': () => Promise<{ success: boolean; folder?: string; error?: string }>
  'sync:set-password': (password: string) => Promise<void>
  'sync:now': () => Promise<{ success: boolean; error?: string }>
  'sync:disable': () => Promise<void>
  'sync:load-settings': () => Promise<{ enabled: boolean; folder: string | null }>

  // Import/Export
  'import:csv': () => Promise<ImportResult>
  'import:json': () => Promise<ImportResult>
  'export:csv': (entryIds?: number[]) => Promise<{ success: boolean } | void>
  'export:json': (entryIds?: number[]) => Promise<{ success: boolean } | void>

  // Integrity
  'integrity:check': () => Promise<{ ok: boolean; current?: string; expected?: string }>

  // Global Shortcut
  'shortcut:get': () => Promise<string>
  'shortcut:set': (shortcut: string) => Promise<{ success: boolean; error?: string }>

  // Alarm mode — bypass key check
  'entries:force-list': () => Promise<EncryptedEntry[]>
  'entries:force-delete': (id: number) => Promise<void>
  'entries:panic-backup': () => Promise<Array<EncryptedEntry & { decrypted?: Record<string, string> }>>
  'entries:complete-panic': () => Promise<void>

  // Email / Telegram
  'email:send-backup': (backupData: string) => Promise<{ success: boolean; error?: string; filePath?: string; sent?: boolean; sentVia?: string }>
  'email:test-telegram': (token: string) => Promise<{ ok: boolean; botName?: string; error?: string }>
  'email:get-chat-id': (token: string) => Promise<string | null>
  'email:save-telegram': (token: string, chatId: string) => Promise<void>
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
