import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { Upload, AlertTriangle, CheckCircle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export function PanicBackupImportDialog({ open, onClose }: Props) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async () => {
    if (!password) {
      addToast('Введите пароль бэкапа', 'warning')
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const res = await invoke('backup:import-panic', password)
      if (res.success) {
        setResult({ imported: res.imported || 0, skipped: res.skipped || 0 })
        addToast(`Restored ${res.imported} entries from panic backup`, 'success')
      } else {
        addToast(res.error || 'Failed to import panic backup', 'error')
      }
    } catch (e: any) {
      addToast(e?.message || 'Failed to import panic backup', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPassword('')
    setResult(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Panic Backup"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
          <AlertTriangle size={16} className="text-vault-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-vault-warning">
            This will restore entries from an encrypted panic backup (.enc file). The entries will be added to your current vault.
          </p>
        </div>

        {!result ? (
          <>
            <p className="text-sm text-vault-text-secondary">
              Select the .enc backup file and enter your backup password to decrypt it.
            </p>

            <Input
              label="Backup Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPasswordToggle
              autoFocus
            />
          </>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-400">
              Restored {result.imported} entries ({result.skipped} skipped)
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>{t('cancel')}</Button>
          {!result && (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Decrypting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload size={16} />
                  Import
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
