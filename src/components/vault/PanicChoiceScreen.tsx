import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, Trash2, Mail } from 'lucide-react'
import { useToastStore } from '../ui/Toast'
import { runPanicWipe, backupReasonKey, type BackupResult } from './panicBackup'

interface Props {
  onDone: () => void
}

// Duress mode gives no choice: the moment it activates, real data is
// backed up (best-effort) to Telegram and then permanently deleted.
// A missing/failed backup must never block the wipe — losing the backup
// is an acceptable tradeoff, leaving the real data behind under duress is not.
export function PanicChoiceScreen({ onDone }: Props) {
  const { t } = useI18n()
  const [backupResult, setBackupResult] = useState<BackupResult>(null)
  const addToast = useToastStore((s) => s.addToast)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void wipeAndBackup()
  }, [])

  const wipeAndBackup = async () => {
    const { backupResult: result } = await runPanicWipe({ invoke })
    setBackupResult(result)
    addToast(t('panic_wipe_done'), 'success')
    // If backup failed critically (no password or unexpected error), don't
    // auto-close — user must explicitly acknowledge the error so they see why
    // the backup didn't happen. For successful backups or non-critical errors
    // (e.g. Telegram config missing, but file saved locally), auto-close after
    // a brief delay so the user sees the success message.
    const isCriticalFailure = result?.reason === 'no_backup_password' || result?.reason === 'backup_failed'
    if (!isCriticalFailure) {
      setTimeout(onDone, 1500)
    }
  }

  const isCriticalFailure = backupResult?.reason === 'no_backup_password' || backupResult?.reason === 'backup_failed'

  return (
    <div className="min-h-screen bg-vault-bg flex items-center justify-center">
      <div className="w-full max-w-md mx-4 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-vault-warning/10 border border-vault-warning/30 flex items-center justify-center mx-auto">
          <AlertTriangle size={32} className="text-vault-warning" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-vault-text mb-2">{t('panic_choice_title')}</h1>
          {!backupResult ? (
            <div className="flex items-center justify-center gap-2 text-sm text-vault-text-secondary">
              <div className="w-4 h-4 border-2 border-vault-text-secondary border-t-transparent rounded-full animate-spin" />
              <Trash2 size={16} />
              {t('panic_wiping_status')}
            </div>
          ) : (
            <p className="text-sm text-vault-text-secondary">{t('panic_wipe_done')}</p>
          )}
        </div>

        {backupResult && (
          <>
            <div className="bg-vault-surface border border-vault-border rounded-xl p-4 space-y-3 text-left">
              {backupResult.emailed ? (
                <div className="flex items-center gap-2 text-green-400">
                  <Mail size={16} />
                  <p className="text-xs font-medium">{t('panic_backup_sent')}</p>
                </div>
              ) : (
                <>
                  {backupResult.reason === 'no_backup_password' || backupResult.reason === 'backup_failed' ? (
                    <p className="text-xs font-medium text-red-400">{t('panic_backup_failed')}</p>
                  ) : (
                    <p className="text-xs font-medium text-vault-text-secondary">{t('panic_backup_saved')}</p>
                  )}
                  {backupResult.reason && (
                    <p className="text-[10px] text-vault-warning">{t(backupReasonKey(backupResult.reason))}</p>
                  )}
                  {backupResult.filePath && (
                    <p className="text-[10px] text-vault-text-secondary break-all">{backupResult.filePath}</p>
                  )}
                </>
              )}
            </div>

            {isCriticalFailure && (
              <button
                onClick={onDone}
                className="w-full py-3 px-4 rounded-xl bg-vault-surface border border-vault-border text-vault-text text-sm font-medium hover:bg-vault-surface-hover active:scale-98 transition-all"
              >
                {t('close')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
