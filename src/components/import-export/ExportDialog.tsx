import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'

interface Props {
  open: boolean
  onClose: () => void
}

export function ExportDialog({ open, onClose }: Props) {
  const { t } = useI18n()
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleExport = async () => {
    setLoading(true)
    try {
      let result
      if (format === 'csv') {
        result = await invoke('export:csv')
      } else {
        result = await invoke('export:json')
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

        {/* Warning */}
        <div className="p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
          <p className="text-xs text-vault-warning leading-relaxed">
            {t('export_warning')}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? t('exporting') : t('export')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
