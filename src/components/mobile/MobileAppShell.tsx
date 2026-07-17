import { useEffect, useState } from 'react'
import { MobileNav } from './MobileNav'
import { MobileEntryDetail } from './MobileEntryDetail'
import { PasswordGenerator } from '../password-gen/PasswordGenerator'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ImportDialog } from '../import-export/ImportDialog'
import { Modal } from '../ui/Modal'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { useVaultStore } from '../../store/vaultStore'
import { useI18n } from '../../i18n'
import { AlertTriangle, Search, Plus, Download } from 'lucide-react'
import type { EntryType } from '@shared/types'

function getTypeLabels(t: (key: string) => string): Record<EntryType, string> {
  return {
    login: t('type_login'),
    card: t('type_card'),
    secure_note: t('type_note'),
    identity: t('type_identity'),
  }
}

export function MobileAppShell() {
  const { entries, loading, selectEntry, selectedEntry, toggleFavorite, filters, setFilters, loadEntries } = useEntriesStore()
  const { setShowPasswordGenerator, showPasswordGenerator, showSettings, setShowSettings } = useUIStore()
  const { alarmMode } = useVaultStore()
  const { t } = useI18n()
  const TYPE_LABELS = getTypeLabels(t)
  const [searchQuery, setSearchQuery] = useState('')
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    // Load entries on mount
    loadEntries()
  }, [])

  const filteredEntries = entries.filter((entry) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        entry.display_title?.toLowerCase().includes(query) ||
        entry.entry_type.toLowerCase().includes(query)
      )
    }
    if (filters.entry_type) {
      return entry.entry_type === filters.entry_type
    }
    return true
  })

  const handleTypeFilter = (type: EntryType | null) => {
    setFilters({ ...filters, entry_type: type || undefined })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-vault-bg">
        <div className="w-8 h-8 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-vault-bg pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-vault-surface border-b border-vault-border">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-lg font-semibold text-vault-text">CipherVault</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowImport(true)}
              className="p-2 text-vault-text-secondary hover:text-vault-accent"
              title={t('import')}
            >
              <Download size={20} />
            </button>
            <button
              onClick={() => setShowPasswordGenerator(true)}
              className="p-2 text-vault-accent"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-text-secondary" />
            <input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-vault-bg border border-vault-border rounded-xl text-sm text-vault-text placeholder:text-vault-text-secondary focus:outline-none focus:border-vault-accent"
              data-search-input
            />
          </div>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {([null, 'login', 'card', 'secure_note', 'identity'] as const).map((type) => (
            <button
              key={type ?? 'all'}
              onClick={() => handleTypeFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                filters.entry_type === type || (!filters.entry_type && !type)
                  ? 'bg-vault-accent/10 text-vault-accent border border-vault-accent/30'
                  : 'bg-vault-surface text-vault-text-secondary border border-vault-border'
              }`}
            >
              {type ? TYPE_LABELS[type] : 'Все'}
            </button>
          ))}
        </div>
      </div>

      {/* Entry list */}
      <div className="px-4">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-vault-text-secondary">
            <div className="w-16 h-16 rounded-2xl bg-vault-surface border border-vault-border flex items-center justify-center mb-4">
              {alarmMode ? (
                <AlertTriangle size={32} className="text-vault-warning" />
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              )}
            </div>
            <p className="text-lg font-medium mb-2">
              {alarmMode ? 'Запасной сейф пуст' : 'Пока нет записей'}
            </p>
            <p className="text-sm text-center">
              {alarmMode
                ? 'Вы в режиме дуressа. Реальные данные скрыты.'
                : 'Добавьте первую запись или импортируйте из другого менеджера'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => selectEntry(entry.id)}
                className="flex items-center gap-3 p-3 bg-vault-surface rounded-xl border border-vault-border active:bg-vault-surface-hover transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-vault-bg flex items-center justify-center text-vault-text-secondary flex-shrink-0">
                  {getEntryIcon(entry.entry_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-vault-text truncate">
                    {entry.display_title || TYPE_LABELS[entry.entry_type] || entry.entry_type}
                  </div>
                  <div className="text-xs text-vault-text-secondary truncate">
                    {entry.entry_type}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(entry.id) }}
                  className={`p-1 ${entry.is_favorite ? 'text-vault-warning' : 'text-vault-text-secondary'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={entry.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile navigation */}
      <MobileNav />

      {/* Entry detail (full screen) */}
      {selectedEntry && <MobileEntryDetail />}

      {/* Password Generator */}
      <Modal open={showPasswordGenerator} onClose={() => setShowPasswordGenerator(false)} title={t('password_generator')}>
        <PasswordGenerator onUsePassword={() => setShowPasswordGenerator(false)} />
      </Modal>

      {/* Settings */}
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Import */}
      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  )
}

function getEntryIcon(type: string) {
  switch (type) {
    case 'login': return '🔑'
    case 'card': return '💳'
    case 'secure_note': return '📝'
    case 'identity': return '👤'
    default: return '🔐'
  }
}
