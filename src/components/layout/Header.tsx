import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke, copyWithTtl } from '../../lib/ipc'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { useVaultStore } from '../../store/vaultStore'
import { useClipboardStore } from '../../store/clipboardStore'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { Search, Plus, LayoutGrid, List, Sun, Moon, Download, Upload, Key, ArrowUpDown, ArrowUp, ArrowDown, Clock, Trash2 } from 'lucide-react'
import { CreateEntryModal } from '../entries/CreateEntryModal'
import { ImportDialog } from '../import-export/ImportDialog'
import { ExportDialog } from '../import-export/ExportDialog'
import { Modal } from '../ui/Modal'
import { PasswordGenerator } from '../password-gen/PasswordGenerator'
import type { SortField } from '../../store/entriesStore'

export function Header() {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { theme, toggleTheme, showPasswordGenerator, setShowPasswordGenerator } = useUIStore()
  const { viewMode, setViewMode, search, loadEntries, sortField, sortDir, setSort } = useEntriesStore()
  const { lock } = useVaultStore()
  const { items: clipboardItems, clearItems: clearClipboard } = useClipboardStore()
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showClipboard, setShowClipboard] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      // Ctrl+N - New entry
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        setShowCreate(true)
      }
      // Ctrl+L - Lock vault
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        lock()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lock])

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value)
      if (value.trim()) {
        search(value)
      } else {
        loadEntries()
      }
    },
    [search, loadEntries]
  )

  return (
    <>
      <div className="h-14 border-b border-vault-border flex items-center px-4 gap-3 bg-vault-surface/50 backdrop-blur-sm">
        {/* Search */}
        <div className="flex-1 relative max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-text-secondary" />
          <input
            ref={searchRef}
            type="text"
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-lg bg-vault-bg border border-vault-border text-sm text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-vault-bg border border-vault-border rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-vault-surface text-vault-text' : 'text-vault-text-secondary hover:text-vault-text'
            }`}
          >
            <List size={16} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid' ? 'bg-vault-surface text-vault-text' : 'text-vault-text-secondary hover:text-vault-text'
            }`}
          >
            <LayoutGrid size={16} />
          </button>
        </div>

        {/* Sort selector */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
            title={t('sort_by')}
          >
            <ArrowUpDown size={16} />
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-full mt-1 bg-vault-surface border border-vault-border rounded-xl shadow-2xl py-1 min-w-[140px] z-50">
              {([
                { field: 'updated_at' as SortField, label: t('sort_date') },
                { field: 'display_title' as SortField, label: t('sort_name') },
                { field: 'entry_type' as SortField, label: t('sort_type') },
              ]).map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => { setSort(field); setShowSortMenu(false) }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                    sortField === field ? 'text-vault-accent bg-vault-accent/10' : 'text-vault-text hover:bg-vault-surface-hover'
                  }`}
                >
                  {label}
                  {sortField === field && (
                    sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Password generator */}
        <button
          onClick={() => setShowPasswordGenerator(true)}
          className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
          title={t('password_generator')}
        >
          <Key size={16} />
        </button>

        {/* Import */}
        <button
          onClick={() => setShowImport(true)}
          className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
          title={t('import')}
        >
          <Download size={16} />
        </button>

        {/* Export */}
        <button
          onClick={() => setShowExport(true)}
          className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
          title={t('export')}
        >
          <Upload size={16} />
        </button>

        {/* Recent clipboard */}
        <div className="relative">
          <button
            onClick={() => setShowClipboard(!showClipboard)}
            className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
            title={t('recent_clipboard')}
          >
            <Clock size={16} />
          </button>
          {showClipboard && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-vault-surface border border-vault-border rounded-xl shadow-2xl z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-vault-border">
                <span className="text-xs font-medium text-vault-text">{t('recent_clipboard')}</span>
                {clipboardItems.length > 0 && (
                  <button
                    onClick={clearClipboard}
                    className="text-xs text-vault-text-secondary hover:text-vault-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {clipboardItems.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-vault-text-secondary">
                    {t('no_copied_items')}
                  </div>
                ) : (
                  clipboardItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={async () => {
                        // Re-copy the item
                        const entry = await invoke('entries:get', parseInt(item.id))
                        if (entry) {
                          let text = ''
                          if (item.type === 'password') text = entry.password || ''
                          else if (item.type === 'username') text = entry.username || ''
                          else if (item.type === 'url') text = entry.url || ''
                          if (text) {
                            await copyWithTtl(text)
                            addToast(t('copied_to_clipboard'), 'success')
                          }
                        }
                        setShowClipboard(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-vault-surface-hover transition-colors flex items-center gap-2"
                    >
                      <span className="text-xs text-vault-text-secondary capitalize">{item.type}:</span>
                      <span className="text-xs text-vault-text truncate flex-1">{item.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Add entry */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-vault-accent text-white rounded-lg hover:bg-vault-accent-hover transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          <span>{t('add')}</span>
        </button>
      </div>

      <CreateEntryModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setGeneratedPassword(null) }}
        initialPassword={generatedPassword}
      />
      <ImportDialog open={showImport} onClose={() => setShowImport(false)} />
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />

      {/* Password Generator Modal */}
      <Modal open={showPasswordGenerator} onClose={() => setShowPasswordGenerator(false)} title={t('password_generator')}>
        <PasswordGenerator onUsePassword={(pwd) => {
          setShowPasswordGenerator(false)
          setGeneratedPassword(pwd)
          setShowCreate(true)
        }} />
      </Modal>
    </>
  )
}
