import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { useEntriesStore } from '../../store/entriesStore'
import type { ImportResult } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportDialog({ open, onClose }: Props) {
  const { t } = useI18n()
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const addToast = useToastStore((s) => s.addToast)
  const loadEntries = useEntriesStore((s) => s.loadEntries)

  const handleImport = async () => {
    setLoading(true)
    setResult(null)
    try {
      const importResult = format === 'csv'
        ? await invoke('import:csv')
        : await invoke('import:json')
      setResult(importResult)
      if (importResult.imported > 0) {
        addToast(t('imported_entries', { count: importResult.imported }), 'success')
        await loadEntries()
      }
      if (importResult.errors.length > 0) {
        addToast(t('import_errors', { count: importResult.errors.length }), 'warning')
      }
    } catch {
      addToast(t('import_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('import_entries')}>
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

        {/* Supported formats info */}
        <div className="p-3 rounded-lg bg-vault-bg border border-vault-border">
          <p className="text-xs text-vault-text-secondary leading-relaxed">
            {format === 'csv'
              ? t('import_csv_hint')
              : t('import_json_hint')}
          </p>
        </div>

        {/* Result */}
        {result && (
          <div className={`p-3 rounded-lg border ${
            result.imported > 0 ? 'bg-vault-success/10 border-vault-success/30' : 'bg-vault-danger/10 border-vault-danger/30'
          }`}>
            <p className="text-sm text-vault-text">
              {t('imported')}: <span className="font-bold">{result.imported}</span> |
              {t('skipped')}: <span className="font-bold">{result.skipped}</span>
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2 text-xs text-vault-text-secondary">
                {result.errors.slice(0, 3).map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
                {result.errors.length > 3 && <p>• ...{t('and_n_more', { n: result.errors.length - 3 })}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose}>{t('close')}</Button>
          <Button onClick={handleImport} disabled={loading}>
            {loading ? t('importing') : t('choose_file')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
