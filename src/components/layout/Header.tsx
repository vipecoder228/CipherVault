import { useState, useCallback, useEffect, useRef } from 'react'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { useVaultStore } from '../../store/vaultStore'
import { Search, Plus, LayoutGrid, List, Sun, Moon, Download, Upload, Key } from 'lucide-react'
import { CreateEntryModal } from '../entries/CreateEntryModal'
import { ImportDialog } from '../import-export/ImportDialog'
import { ExportDialog } from '../import-export/ExportDialog'
import { Modal } from '../ui/Modal'
import { PasswordGenerator } from '../password-gen/PasswordGenerator'

export function Header() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { viewMode, setViewMode, theme, toggleTheme, showPasswordGenerator, setShowPasswordGenerator } = useUIStore()
  const { search, loadEntries } = useEntriesStore()
  const { lock } = useVaultStore()

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
            placeholder="Search entries... (Ctrl+K)"
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
          title="Password Generator"
        >
          <Key size={16} />
        </button>

        {/* Import */}
        <button
          onClick={() => setShowImport(true)}
          className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
          title="Import"
        >
          <Download size={16} />
        </button>

        {/* Export */}
        <button
          onClick={() => setShowExport(true)}
          className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
          title="Export"
        >
          <Upload size={16} />
        </button>

        {/* Add entry */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-vault-accent text-white rounded-lg hover:bg-vault-accent-hover transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          <span>Add</span>
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
      <Modal open={showPasswordGenerator} onClose={() => setShowPasswordGenerator(false)} title="Password Generator">
        <PasswordGenerator onUsePassword={(pwd) => {
          setShowPasswordGenerator(false)
          setGeneratedPassword(pwd)
          setShowCreate(true)
        }} />
      </Modal>
    </>
  )
}
