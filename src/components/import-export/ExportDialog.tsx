import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
}

export function ExportDialog({ open, onClose }: Props) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleExport = async () => {
    setLoading(true)
    try {
      if (format === 'csv') {
        await invoke('export:csv')
      } else {
        await invoke('export:json')
      }
      addToast('Export completed', 'success')
      onClose()
    } catch {
      addToast('Export failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Entries">
      <div className="space-y-5">
        {/* Format selection */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">Format</label>
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
            Exported data will contain your passwords in plain text. Keep the file secure and delete it after use.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
