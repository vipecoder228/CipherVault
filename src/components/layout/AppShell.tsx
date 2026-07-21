import { useEffect, useState, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { EntryDetail } from '../entries/EntryDetail'
import { DisposableEmailPanel } from '../disposable-email/DisposableEmailPanel'
import { TrashPanel } from '../trash/TrashPanel'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { useVaultStore } from '../../store/vaultStore'
import { useI18n } from '../../i18n'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, Search, Copy, Check, Shield } from 'lucide-react'
import type { EntryType } from '@shared/types'

export function AppShell() {
  const selectedEntry = useEntriesStore((s) => s.selectedEntry)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const showDisposableEmail = useUIStore((s) => s.showDisposableEmail)
  const showTrash = useUIStore((s) => s.showTrash)
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
  const { t } = useI18n()
  const { entries, viewMode, loading, selectEntry, selectedEntry, toggleFavorite, filters, setFilters, searchQuery } = useEntriesStore()
  const setShowPasswordGenerator = useUIStore((s) => s.setShowPasswordGenerator)
  const alarmMode = useVaultStore((s) => s.alarmMode)
  const addToast = useToastStore((s) => s.addToast)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entryId: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkActions, setShowBulkActions] = useState(false)

  const toggleSelect = (id: number, ctrlKey?: boolean) => {
    if (ctrlKey) {
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      )
    } else {
      setSelectedIds(prev => prev.includes(id) ? [] : [id])
    }
  }

  const clearSelection = () => {
    setSelectedIds([])
    setShowBulkActions(false)
  }

  const handleBulkDelete = async () => {
    if (!confirm(t('bulk_delete_confirm', { n: selectedIds.length }))) return
    for (const id of selectedIds) {
      await invoke('entries:delete', id)
    }
    addToast(t('bulk_deleted', { n: selectedIds.length }), 'success')
    clearSelection()
    loadEntries()
  }

  const handleBulkMove = async (categoryId: number) => {
    for (const id of selectedIds) {
      const entry = await invoke('entries:get', id)
      if (entry) {
        await invoke('entries:update', id, { category_id: categoryId })
      }
    }
    addToast(t('bulk_moved', { n: selectedIds.length }), 'success')
    clearSelection()
    loadEntries()
  }

  useEffect(() => {
    setShowBulkActions(selectedIds.length > 1)
  }, [selectedIds])

  // Keyboard shortcuts for entry list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is in input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return

      const currentIdx = entries.findIndex(en => en.id === selectedEntry?.id)

      // Arrow keys - navigate entries
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const nextIdx = currentIdx < entries.length - 1 ? currentIdx + 1 : 0
        selectEntry(entries[nextIdx]?.id || null)
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : entries.length - 1
        selectEntry(entries[prevIdx]?.id || null)
      }

      // Enter - open entry
      if (e.key === 'Enter' && selectedEntry) {
        // Already selected, detail panel opens automatically
      }

      // Delete - delete entry
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEntry) {
        e.preventDefault()
        const event = new CustomEvent('entry-delete', { detail: { id: selectedEntry.id } })
        window.dispatchEvent(event)
      }

      // Ctrl+C - copy password
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedEntry?.password) {
        e.preventDefault()
        invoke('clipboard:copy', selectedEntry.password, 30000)
        addToast(t('copied_to_clipboard'), 'success')
      }

      // Ctrl+U - copy username
      if ((e.ctrlKey || e.metaKey) && e.key === 'u' && selectedEntry?.username) {
        e.preventDefault()
        invoke('clipboard:copy', selectedEntry.username, 30000)
        addToast(t('copied_to_clipboard'), 'success')
      }

      // Escape - deselect
      if (e.key === 'Escape') {
        if (selectedIds.length > 0) {
          clearSelection()
        } else {
          selectEntry(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [entries, selectedEntry, selectedIds, selectEntry, addToast, t])

  const handleQuickCopy = async (e: React.MouseEvent, entryId: number) => {
    e.stopPropagation()
    try {
      const entry = await invoke('entries:get', entryId)
      if (entry?.password) {
        await invoke('clipboard:copy', entry.password, 30000)
        setCopiedId(entryId)
        addToast(t('copied_to_clipboard'), 'success')
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch {
      addToast(t('failed_to_copy'), 'error')
    }
  }

  const handleContextMenu = (e: React.MouseEvent, entryId: number) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entryId })
  }

  const handleContextAction = async (action: 'username' | 'password' | 'url') => {
    if (!contextMenu) return
    try {
      const entry = await invoke('entries:get', contextMenu.entryId)
      if (!entry) return
      let text = ''
      if (action === 'username') text = entry.username || ''
      else if (action === 'password') text = entry.password || ''
      else if (action === 'url') text = entry.url || ''
      if (text) {
        await invoke('clipboard:copy', text, 30000)
        addToast(t('copied_to_clipboard'), 'success')
      }
    } catch {
      addToast(t('failed_to_copy'), 'error')
    }
    setContextMenu(null)
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

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
            {type ? TYPE_LABELS[type] : t('all')}
          </button>
        ))}
      </div>

      {/* Bulk actions toolbar */}
      {showBulkActions && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-vault-accent/10 border border-vault-accent/30 animate-slide-up">
          <span className="text-sm font-medium text-vault-accent">
            {t('selected_count', { n: selectedIds.length })}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 rounded-lg bg-vault-danger/10 text-vault-danger text-xs font-medium hover:bg-vault-danger/20 transition-colors"
          >
            {t('delete')}
          </button>
          <button
            onClick={clearSelection}
            className="px-3 py-1.5 rounded-lg bg-vault-surface text-vault-text-secondary text-xs font-medium hover:bg-vault-surface-hover transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-vault-text-secondary">
          {searchQuery ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-vault-surface border border-vault-border flex items-center justify-center mb-4">
                <Search size={32} className="text-vault-text-secondary" />
              </div>
              <p className="text-lg font-medium mb-2">{t('no_search_results')}</p>
              <p className="text-sm">{t('no_search_results_hint')}</p>
            </>
          ) : alarmMode ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-vault-surface border border-vault-border flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-vault-warning" />
              </div>
              <p className="text-lg font-medium mb-2">{t('decoy_vault_empty')}</p>
              <p className="text-sm mb-4">{t('duress_hidden')}</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-vault-surface border border-vault-border flex items-center justify-center mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">{t('no_entries')}</p>
              <p className="text-sm mb-4">{t('no_entries_hint')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPasswordGenerator(true)}
                  className="px-4 py-2 bg-vault-accent text-white rounded-lg hover:bg-vault-accent-hover transition-colors text-sm"
                >
                  {t('generate_password')}
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
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  toggleSelect(entry.id, true)
                } else if (selectedIds.length > 0) {
                  toggleSelect(entry.id)
                } else {
                  selectEntry(entry.id)
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, entry.id)}
              className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-150 transition-opacity duration-200 ${
                selectedEntry?.id === entry.id
                  ? 'bg-vault-accent/10 border border-vault-accent/30'
                  : selectedIds.includes(entry.id)
                  ? 'bg-vault-accent/5 border border-vault-accent/20'
                  : 'hover:bg-vault-surface-hover border border-transparent'
              }`}
            >
              {selectedIds.length > 0 && (
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selectedIds.includes(entry.id) ? 'bg-vault-accent border-vault-accent' : 'border-vault-border'
                }`}>
                  {selectedIds.includes(entry.id) && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )}
              <div className="w-10 h-10 rounded-xl bg-vault-surface border border-vault-border flex items-center justify-center text-vault-text-secondary flex-shrink-0">
                {getEntryIcon(entry.entry_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-vault-text truncate">
                  {entry.display_title || TYPE_LABELS[entry.entry_type] || entry.entry_type}
                </div>
                <div className="text-xs text-vault-text-secondary truncate">
                  {entry.display_url || entry.entry_type}
                </div>
              </div>
              {entry.entry_type === 'login' && (
                <button
                  onClick={(e) => handleQuickCopy(e, entry.id)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    copiedId === entry.id
                      ? 'text-vault-success bg-vault-success/10'
                      : 'text-vault-text-secondary hover:text-vault-accent hover:bg-vault-accent/10'
                  }`}
                  title={t('copy_password')}
                >
                  {copiedId === entry.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
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
              className={`p-4 rounded-xl cursor-pointer transition-all duration-150 transition-opacity duration-200 border ${
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-vault-surface border border-vault-border rounded-xl shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleContextAction('username')}
            className="w-full px-4 py-2 text-left text-sm text-vault-text hover:bg-vault-surface-hover transition-colors"
          >
            {t('copy_username')}
          </button>
          <button
            onClick={() => handleContextAction('password')}
            className="w-full px-4 py-2 text-left text-sm text-vault-text hover:bg-vault-surface-hover transition-colors"
          >
            {t('copy_password')}
          </button>
          <button
            onClick={() => handleContextAction('url')}
            className="w-full px-4 py-2 text-left text-sm text-vault-text hover:bg-vault-surface-hover transition-colors"
          >
            {t('copy_url')}
          </button>
          <div className="border-t border-vault-border my-1" />
          <button
            onClick={() => { selectEntry(contextMenu.entryId); setContextMenu(null) }}
            className="w-full px-4 py-2 text-left text-sm text-vault-text hover:bg-vault-surface-hover transition-colors"
          >
            {t('open')}
          </button>
          <button
            onClick={async () => {
              if (confirm(t('delete_entry_confirm'))) {
                await deleteEntry(contextMenu.entryId)
                addToast(t('entry_deleted'), 'success')
              }
              setContextMenu(null)
            }}
            className="w-full px-4 py-2 text-left text-sm text-vault-danger hover:bg-vault-danger/10 transition-colors"
          >
            {t('delete')}
          </button>
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

function TOTPBadge({ entryId }: { entryId: number }) {
  const [code, setCode] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)

  const fetchCode = useCallback(async () => {
    try {
      const totpCode = await invoke('entries:get-totp', entryId)
      if (typeof totpCode === 'string' && totpCode) {
        setCode(totpCode)
      }
    } catch {}
  }, [entryId])

  useEffect(() => {
    fetchCode()
    const interval = setInterval(() => {
      fetchCode()
      setTimeLeft(30)
    }, 30000)

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 30 : prev - 1))
    }, 1000)

    return () => {
      clearInterval(interval)
      clearInterval(timer)
    }
  }, [fetchCode])

  if (!code) return null

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-vault-accent/10 border border-vault-accent/20">
      <Shield size={10} className="text-vault-accent" />
      <span className="text-[10px] font-mono font-bold text-vault-accent tracking-wider">{code}</span>
      <span className="text-[8px] text-vault-text-secondary">{timeLeft}s</span>
    </div>
  )
}
