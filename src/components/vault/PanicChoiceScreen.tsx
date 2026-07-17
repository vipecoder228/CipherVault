import { useState } from 'react'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, Trash2, Shield } from 'lucide-react'
import { Button } from '../ui/Button'
import { useToastStore } from '../ui/Toast'

interface Props {
  onChoice: (action: 'empty' | 'wipe') => void
}

export function PanicChoiceScreen({ onChoice }: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleWipeAndBackup = async () => {
    setLoading(true)
    try {
      // 1. Get backup email
      const email = await invoke('settings:get', 'alarm_backup_email')
      if (!email) {
        addToast('Backup email not configured', 'error')
        setLoading(false)
        return
      }

      // 2. Get entries with decryption (panic key is available)
      const entries = await invoke('entries:panic-backup')

      if (!entries || entries.length === 0) {
        addToast('No entries found to wipe', 'warning')
        onChoice('wipe')
        return
      }

      // 3. Create backup JSON with DECRYPTED entries
      const backupData = JSON.stringify({
        format: 'ciphervault-panic-backup',
        version: '1.0',
        timestamp: new Date().toISOString(),
        entryCount: entries.length,
        entries: entries.map((e) => ({
          id: e.id,
          entry_type: e.entry_type,
          display_title: e.display_title,
          ...(e.decrypted || {}),
        })),
      }, null, 2)

      // 4. Save backup + open email client
      const sendResult = await invoke('email:send-backup', email, backupData)
      if (!sendResult?.success) {
        addToast('Backup save failed: ' + (sendResult?.error || 'Unknown error'), 'error')
      }

      // 5. Delete all entries
      for (const entry of entries) {
        await invoke('entries:force-delete', entry.id)
      }

      // 6. Clear panic key
      await invoke('entries:complete-panic')

      const pathInfo = sendResult?.filePath ? ` (${sendResult.filePath})` : ''
      addToast(`Backup saved${pathInfo}. Email client opened. All data wiped.`, 'success')
      onChoice('wipe')
    } catch (err: any) {
      console.error('Panic backup failed:', err)
      addToast('Backup failed: ' + (err.message || 'Unknown error'), 'error')
      try {
        const entries = await invoke('entries:panic-backup')
        for (const entry of entries) {
          await invoke('entries:force-delete', entry.id)
        }
        await invoke('entries:complete-panic')
        addToast('Data wiped (backup failed)', 'warning')
        onChoice('wipe')
      } catch {}
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-vault-bg flex items-center justify-center">
      <div className="w-full max-w-md mx-4 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-vault-warning/10 border border-vault-warning/30 flex items-center justify-center mx-auto">
          <AlertTriangle size={32} className="text-vault-warning" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-vault-text mb-2">{t('panic_choice_title')}</h1>
          <p className="text-sm text-vault-text-secondary">
            {t('duress_description')}
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="secondary"
            onClick={() => onChoice('empty')}
            className="w-full h-12"
          >
            <div className="flex items-center justify-center gap-2">
              <Shield size={18} />
              {t('panic_choice_empty')}
            </div>
          </Button>

          <Button
            variant="danger"
            onClick={handleWipeAndBackup}
            disabled={loading}
            className="w-full h-12"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Trash2 size={18} />
                {t('panic_choice_wipe')}
              </div>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
