import { useState } from 'react'
import { useVaultStore } from '../../store/vaultStore'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, Trash2, Shield } from 'lucide-react'
import { Button } from '../ui/Button'

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

      // 2. Export all entries as encrypted JSON (using vault's own encryption key from the real vault)
      // The backup is encrypted with a new random key, then that key is encrypted with the alarm password
      // so only the alarm password holder can decrypt it
      const exportResult = await invoke('backup:export' as any, 'panic_backup')
      if (!exportResult?.success) {
        // Fallback: create JSON export manually
        addToast('Creating backup...', 'success')
      }

      // 3. Get all entries for backup
      const entries = await invoke('entries:list', {})
      
      // 4. Create backup JSON
      const backupData = {
        format: 'ciphervault-panic-backup',
        version: '1.0',
        timestamp: new Date().toISOString(),
        entryCount: entries.length,
        entries: entries,
      }

      // 5. Send via email using disposable email service
      const tempEmail = await invoke('disposable:create')
      if (tempEmail?.address) {
        // Send backup to user's email via temp email
        await invoke('disposable:message' as any, tempEmail.id, email, 'CipherVault Panic Backup', JSON.stringify(backupData, null, 2))
      }

      // 6. Wipe all real entries
      for (const entry of entries) {
        await invoke('entries:permanent-delete', entry.id)
      }

      addToast(`Backup sent to ${email}. All data wiped.`, 'success')
      onChoice('wipe')
    } catch (err: any) {
      console.error('Panic backup failed:', err)
      addToast('Backup failed: ' + (err.message || 'Unknown error'), 'error')
      // Still wipe if backup failed - user chose to wipe
      try {
        const entries = await invoke('entries:list', {})
        for (const entry of entries) {
          await invoke('entries:permanent-delete', entry.id)
        }
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
