import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { Download, Upload, AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'export' | 'import'
}

export function BackupDialog({ open, onClose, mode }: Props) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async () => {
    if (!password) {
      addToast(t('password_required'), 'warning')
      return
    }

    if (mode === 'export' && password !== confirmPassword) {
      addToast(t('passwords_dont_match'), 'warning')
      return
    }

    if (password.length < 8) {
      addToast(t('password_min_length'), 'warning')
      return
    }

    setLoading(true)
    try {
      if (mode === 'export') {
        const result = await invoke('backup:export', password)
        if (result.success) {
          addToast(t('backup_saved', { path: result.path || '' }), 'success')
          handleClose()
        } else if (result.error) {
          addToast(result.error, 'error')
        }
      } else {
        // Import — confirm first
        if (!confirm(t('confirm_vault_replace'))) {
          setLoading(false)
          return
        }
        const result = await invoke('backup:import', password)
        if (result.success) {
          addToast(t('backup_imported'), 'success')
          setTimeout(() => window.location.reload(), 1500)
        } else if (result.error) {
          addToast(result.error, 'error')
        }
      }
    } catch (e: any) {
      addToast(e?.message || t('backup_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPassword('')
    setConfirmPassword('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === 'export' ? t('export_backup') : t('import_backup')}
    >
      <div className="space-y-4">
        {mode === 'import' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
            <AlertTriangle size={16} className="text-vault-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-vault-warning">
              {t('import_warning')}
            </p>
          </div>
        )}

        {mode === 'export' ? (
          <p className="text-sm text-vault-text-secondary">
            {t('export_description')}
          </p>
        ) : (
          <p className="text-sm text-vault-text-secondary">
            {t('import_description')}
          </p>
        )}

        <Input
          label={t('backup_password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showPasswordToggle
          autoFocus
        />

        {mode === 'export' && (
          <Input
            label={t('confirm_password')}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            showPasswordToggle
          />
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {mode === 'export' ? t('encrypting') : t('importing')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {mode === 'export' ? <Download size={16} /> : <Upload size={16} />}
                {mode === 'export' ? t('export_backup') : t('import_backup')}
              </span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
