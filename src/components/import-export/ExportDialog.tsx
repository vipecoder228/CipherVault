import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { useEntriesStore } from '../../store/entriesStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function ExportDialog({ open, onClose }: Props) {
  const { t } = useI18n()
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const { entries } = useEntriesStore()

  useEffect(() => {
    if (open) {
      setSelectedIds([])
      setScope('all')
    }
  }, [open])

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleExport = async () => {
    setLoading(true)
    try {
      const ids = scope === 'selected' ? selectedIds : undefined
      let result
      if (format === 'csv') {
        result = await invoke('export:csv', ids)
      } else {
        result = await invoke('export:json', ids)
      }
      if (result?.success === false) return
      addToast(t('export_completed'), 'success')
      onClose()
    } catch {
      addToast(t('export_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('export_entries')}>
      <div className="space-y-5">
        {/* Format selection */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">{t('format')}</label>
          <div className="flex gap-3">
            {(['csv', 'json'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                  format === f
                    ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                    : 'border-vault-border bg-vault-surface text-vault-text-secondary hover:border-vault-accent/30'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Scope selection */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">{t('export_scope')}</label>
          <div className="flex gap-3">
            <button
              onClick={() => setScope('all')}
              className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                scope === 'all'
                  ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                  : 'border-vault-border bg-vault-surface text-vault-text-secondary hover:border-vault-accent/30'
              }`}
            >
              {t('export_all')}
            </button>
            <button
              onClick={() => setScope('selected')}
              className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                scope === 'selected'
                  ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                  : 'border-vault-border bg-vault-surface text-vault-text-secondary hover:border-vault-accent/30'
              }`}
            >
              {t('export_selected')} ({selectedIds.length})
            </button>
          </div>
        </div>

        {/* Entry selection */}
        {scope === 'selected' && (
          <div className="max-h-48 overflow-y-auto space-y-1 border border-vault-border rounded-xl p-2">
            {entries.map((entry) => (
              <label
                key={entry.id}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  selectedIds.includes(entry.id)
                    ? 'bg-vault-accent/10'
                    : 'hover:bg-vault-surface-hover'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(entry.id)}
                  onChange={() => toggleSelect(entry.id)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selectedIds.includes(entry.id) ? 'bg-vault-accent border-vault-accent' : 'border-vault-border'
                }`}>
                  {selectedIds.includes(entry.id) && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-vault-text truncate">{entry.display_title}</span>
              </label>
            ))}
          </div>
        )}

        {/* Warning */}
        <div className="p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
          <p className="text-xs text-vault-warning leading-relaxed">
            {t('export_warning')}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleExport} disabled={loading || (scope === 'selected' && selectedIds.length === 0)}>
            {loading ? t('exporting') : t('export')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
