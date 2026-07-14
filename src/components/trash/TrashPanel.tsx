import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useEntriesStore } from '../../store/entriesStore'
import { Trash2, RotateCcw, X } from 'lucide-react'

interface DeletedEntry {
  id: number
  display_title: string
  entry_type: string
  deleted_at: string
}

export function TrashPanel() {
  const [entries, setEntries] = useState<DeletedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const loadEntries = useEntriesStore((s) => s.loadEntries)

  useEffect(() => {
    loadDeletedEntries()
  }, [])

  async function loadDeletedEntries() {
    setLoading(true)
    try {
      const deleted = await invoke('entries:deleted')
      setEntries(deleted)
    } catch (err) {
      console.error('Failed to load deleted entries:', err)
    }
    setLoading(false)
  }

  async function handleRestore(id: number) {
    try {
      await invoke('entries:restore', id)
      await loadDeletedEntries()
      await loadEntries()
    } catch (err) {
      console.error('Failed to restore entry:', err)
    }
  }

  async function handlePermanentDelete(id: number) {
    if (!confirm('This entry will be permanently deleted. This action cannot be undone.')) {
      return
    }
    try {
      await invoke('entries:permanent-delete', id)
      await loadDeletedEntries()
    } catch (err) {
      console.error('Failed to permanently delete entry:', err)
    }
  }

  function getEntryTypeIcon(type: string) {
    switch (type) {
      case 'login': return '🔑'
      case 'card': return '💳'
      case 'identity': return '👤'
      case 'secure_note': return '📝'
      default: return '📄'
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-vault-text-secondary">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-vault-border">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-vault-text-secondary" />
          <h2 className="text-lg font-semibold text-vault-text">Trash</h2>
        </div>
        <p className="text-sm text-vault-text-secondary mt-1">
          Deleted entries are kept for 30 days
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-vault-text-secondary">
            <Trash2 className="w-12 h-12 mb-4 opacity-50" />
            <p>Trash is empty</p>
          </div>
        ) : (
          <div className="divide-y divide-vault-border">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-4 hover:bg-vault-surface-hover transition-colors"
              >
                <span className="text-xl">{getEntryTypeIcon(entry.entry_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-vault-text truncate">
                    {entry.display_title}
                  </div>
                  <div className="text-xs text-vault-text-secondary">
                    Deleted {formatDate(entry.deleted_at)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRestore(entry.id)}
                    className="p-2 rounded-lg hover:bg-vault-surface text-vault-text-secondary hover:text-vault-text transition-colors"
                    title="Restore"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(entry.id)}
                    className="p-2 rounded-lg hover:bg-vault-danger/10 text-vault-text-secondary hover:text-vault-danger transition-colors"
                    title="Delete permanently"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
