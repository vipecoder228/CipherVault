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
    setTimeout(onDone, 1500)
  }

  return (
    <div className="min-h-screen bg-vault-bg flex items-center justify-center">
      <div className="w-full max-w-md mx-4 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-vault-warning/10 border border-vault-warning/30 flex items-center justify-center mx-auto">
          <AlertTriangle size={32} className="text-vault-warning" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-vault-text mb-2">{t('panic_choice_title')}</h1>
          <div className="flex items-center justify-center gap-2 text-sm text-vault-text-secondary">
            <div className="w-4 h-4 border-2 border-vault-text-secondary border-t-transparent rounded-full animate-spin" />
            <Trash2 size={16} />
            {t('panic_wiping_status')}
          </div>
        </div>

        {backupResult && (
          <div className="bg-vault-surface border border-vault-border rounded-xl p-4 space-y-3 text-left">
            {backupResult.emailed ? (
              <div className="flex items-center gap-2 text-green-400">
                <Mail size={16} />
                <p className="text-xs font-medium">{t('panic_backup_sent')}</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-medium text-vault-text-secondary">{t('panic_backup_saved')}</p>
                {backupResult.reason && (
                  <p className="text-[10px] text-vault-warning">{t(backupReasonKey(backupResult.reason))}</p>
                )}
                {backupResult.filePath && (
                  <p className="text-[10px] text-vault-text-secondary break-all">{backupResult.filePath}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
