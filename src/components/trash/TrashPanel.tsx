import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useEntriesStore } from '../../store/entriesStore'
import { useI18n } from '../../i18n'
import { Trash2, RotateCcw, X } from 'lucide-react'
import type { EncryptedEntry } from '@shared/types'

export function TrashPanel() {
  const { t } = useI18n()
  const [entries, setEntries] = useState<EncryptedEntry[]>([])
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
    if (!confirm(t('confirm_permanent_delete'))) {
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

    if (diffDays === 0) return t('today')
    if (diffDays === 1) return t('yesterday')
    if (diffDays < 7) return t('days_ago', { n: diffDays })
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-vault-text-secondary">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-vault-border">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-vault-text-secondary" />
          <h2 className="text-lg font-semibold text-vault-text">{t('trash_title')}</h2>
        </div>
        <p className="text-sm text-vault-text-secondary mt-1">
          {t('trash_description')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-vault-text-secondary">
            <Trash2 className="w-12 h-12 mb-4 opacity-50" />
            <p>{t('trash_empty')}</p>
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
                    {t('deleted_date', { date: formatDate(entry.deleted_at || '') })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRestore(entry.id)}
                    className="p-2 rounded-lg hover:bg-vault-surface text-vault-text-secondary hover:text-vault-text transition-colors"
                    title={t('restore')}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(entry.id)}
                    className="p-2 rounded-lg hover:bg-vault-danger/10 text-vault-text-secondary hover:text-vault-danger transition-colors"
                    title={t('delete_permanently')}
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
