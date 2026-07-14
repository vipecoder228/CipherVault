import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { EntryDetail } from '../entries/EntryDetail'
import { DisposableEmailPanel } from '../disposable-email/DisposableEmailPanel'
import { TrashPanel } from '../trash/TrashPanel'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { useVaultStore } from '../../store/vaultStore'
import { AlertTriangle } from 'lucide-react'
import type { EntryType } from '@shared/types'

export function AppShell() {
  const selectedEntry = useEntriesStore((s) => s.selectedEntry)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const showDisposableEmail = useUIStore((s) => s.showDisposableEmail)
  const showTrash = useUIStore((s) => s.showTrash)
  const alarmMode = useVaultStore((s) => s.alarmMode)
  const loadEntries = useEntriesStore((s) => s.loadEntries)

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  return (
    <div className="flex h-screen overflow-hidden bg-vault-bg">
      {/* Sidebar */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0`}>
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {alarmMode && (
          <div className="flex items-center gap-2 px-4 py-2 bg-vault-warning/10 border-b border-vault-warning/30 text-vault-warning text-xs font-medium">
            <AlertTriangle size={14} />
            <span>Duress mode — viewing decoy vault. Real data is hidden.</span>
          </div>
        )}
        <Header />
        <div className="flex-1 flex overflow-hidden">
          {/* Entry list / grid */}
          <div className="flex-1 overflow-y-auto p-6">
            <EntryGrid />
          </div>

          {/* Trash panel */}
          {showTrash && !selectedEntry && (
            <div className="w-[380px] border-l border-vault-border animate-slide-in">
              <TrashPanel />
            </div>
          )}

          {/* Disposable Email panel */}
          {showDisposableEmail && !selectedEntry && (
            <div className="w-[380px] border-l border-vault-border animate-slide-in">
              <DisposableEmailPanel />
            </div>
          )}

          {/* Entry detail panel */}
          {selectedEntry && (
            <div className="w-[380px] border-l border-vault-border animate-slide-in">
              <EntryDetail />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TYPE_LABELS: Record<EntryType, string> = {
  login: 'Login',
  card: 'Card',
  secure_note: 'Secure Note',
  identity: 'Identity',
}

function EntryGrid() {
  const { entries, viewMode, loading, selectEntry, selectedEntry, toggleFavorite, filters, setFilters } = useEntriesStore()
  const setShowPasswordGenerator = useUIStore((s) => s.setShowPasswordGenerator)
  const alarmMode = useVaultStore((s) => s.alarmMode)

  const activeType = filters.entry_type || null

  const handleTypeFilter = (type: EntryType | null) => {
    setFilters({ ...filters, entry_type: type || undefined })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Type filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {([null, 'login', 'card', 'secure_note', 'identity'] as const).map((type) => (
          <button
            key={type ?? 'all'}
            onClick={() => handleTypeFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeType === type || (!activeType && !type)
                ? 'bg-vault-accent/10 text-vault-accent border border-vault-accent/30'
                : 'bg-vault-surface text-vault-text-secondary border border-vault-border hover:text-vault-text'
            }`}
          >
            {type ? TYPE_LABELS[type] : 'All'}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-vault-text-secondary">
          {alarmMode ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-vault-surface border border-vault-border flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-vault-warning" />
              </div>
              <p className="text-lg font-medium mb-2">Decoy vault is empty</p>
              <p className="text-sm mb-4">You are in duress mode. Real data is hidden.</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-vault-surface border border-vault-border flex items-center justify-center mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">No entries yet</p>
              <p className="text-sm mb-4">Add your first password or import from another manager</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPasswordGenerator(true)}
                  className="px-4 py-2 bg-vault-accent text-white rounded-lg hover:bg-vault-accent-hover transition-colors text-sm"
                >
                  Generate Password
                </button>
              </div>
            </>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => selectEntry(entry.id)}
              className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                selectedEntry?.id === entry.id
                  ? 'bg-vault-accent/10 border border-vault-accent/30'
                  : 'hover:bg-vault-surface-hover border border-transparent'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-vault-surface border border-vault-border flex items-center justify-center text-vault-text-secondary flex-shrink-0">
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
                className={`p-1 transition-colors ${entry.is_favorite ? 'text-vault-warning' : 'text-vault-text-secondary hover:text-vault-warning'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={entry.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => selectEntry(entry.id)}
              className={`p-4 rounded-xl cursor-pointer transition-all duration-150 border ${
                selectedEntry?.id === entry.id
                  ? 'bg-vault-accent/10 border-vault-accent/30'
                  : 'bg-vault-surface border-vault-border hover:border-vault-accent/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-vault-bg flex items-center justify-center text-vault-text-secondary">
                  {getEntryIcon(entry.entry_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-vault-text truncate">
                    {entry.display_title || TYPE_LABELS[entry.entry_type]}
                  </div>
                </div>
              </div>
              <div className="text-xs text-vault-text-secondary truncate">
                {entry.entry_type}
              </div>
            </div>
          ))}
        </div>
      )}
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
