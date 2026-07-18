import { useState } from 'react'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { Button } from '../ui/Button'
import { useI18n } from '../../i18n'
import { Shield, AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export function EmergencyAccess({ open, onClose }: Props) {
  const { t } = useI18n()
  const [step, setStep] = useState<'intro' | 'export' | 'done'>('intro')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  if (!open) return null

  const handleExport = async () => {
    if (!password) {
      addToast(t('enter_recovery_password'), 'warning')
      return
    }
    if (password !== confirmPassword) {
      addToast(t('passwords_dont_match'), 'warning')
      return
    }
    if (password.length < 8) {
      addToast(t('recovery_password_min_length'), 'warning')
      return
    }

    setLoading(true)
    try {
      const result = await invoke('backup:export', password)
      if (result.success) {
        addToast(t('emergency_backup_created'), 'success')
        setStep('done')
      } else if (result.error) {
        addToast(result.error, 'error')
      }
    } catch {
      addToast(t('failed_emergency_backup'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-vault-surface border border-vault-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-vault-accent" />
            <h2 className="text-lg font-semibold text-vault-text">{t('emergency_access')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'intro' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-vault-bg border border-vault-border">
                <AlertTriangle size={20} className="text-vault-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm text-vault-text-secondary">
                  <p className="font-medium text-vault-text mb-1">{t('emergency_access_how')}</p>
                  <p>{t('emergency_access_intro')}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-vault-text-secondary">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vault-accent/10 text-vault-accent flex items-center justify-center text-xs font-bold">1</span>
                  <p>{t('emergency_step_1')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vault-accent/10 text-vault-accent flex items-center justify-center text-xs font-bold">2</span>
                  <p>{t('emergency_step_2')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vault-accent/10 text-vault-accent flex items-center justify-center text-xs font-bold">3</span>
                  <p>{t('emergency_step_3')}</p>
                </div>
              </div>

              <Button onClick={() => setStep('export')} className="w-full">
                {t('create_emergency_backup')}
              </Button>
            </div>
          )}

          {step === 'export' && (
            <div className="space-y-4">
              <p className="text-sm text-vault-text-secondary">
                {t('emergency_export_description')}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-vault-text-secondary mb-1.5 block">{t('recovery_password')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('enter_recovery_password')}
                    className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-vault-text-secondary mb-1.5 block">{t('confirm_password')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('confirm_recovery_password')}
                    className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep('intro')} className="flex-1">{t('back')}</Button>
                <Button onClick={handleExport} disabled={loading} className="flex-1">
                  {loading ? t('creating') : t('create_backup')}
                </Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-vault-success/10 border border-vault-success/30 flex items-center justify-center mx-auto">
                <Shield size={32} className="text-vault-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-vault-text mb-2">{t('emergency_backup_created')}</h3>
                <p className="text-sm text-vault-text-secondary">
                  {t('emergency_done_description')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-vault-bg border border-vault-border text-left">
                <p className="text-xs text-vault-text-secondary">
                  <strong className="text-vault-text">{t('important')}:</strong> {t('emergency_important_note')}
                </p>
              </div>
              <Button onClick={onClose} className="w-full">{t('done')}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
