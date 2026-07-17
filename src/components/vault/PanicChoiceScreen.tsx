import { useState } from 'react'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, Trash2, Shield, Mail } from 'lucide-react'
import { Button } from '../ui/Button'
import { useToastStore } from '../ui/Toast'

interface Props {
  onChoice: (action: 'empty' | 'wipe') => void
}

export function PanicChoiceScreen({ onChoice }: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [backupResult, setBackupResult] = useState<{ emailed?: boolean; filePath?: string } | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const handleWipeAndBackup = async () => {
    setLoading(true)
    try {
      // 1. Get backup password
      const backupPassword = await invoke('settings:get', 'panic_backup_password')
      if (!backupPassword) {
        addToast('Backup password not configured', 'error')
        setLoading(false)
        return
      }

      // 2. Get entries with decryption
      const entries = await invoke('entries:panic-backup')

      if (!entries || entries.length === 0) {
        addToast('No entries found to wipe', 'warning')
        onChoice('wipe')
        return
      }

      // 5. Create backup JSON with decrypted entries
      const backupJson = JSON.stringify({
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

      // 6. Encrypt backup with password
      const encrypted = await encryptText(backupJson, backupPassword)

      // 7. Send via Telegram or save to file
      const sendResult = await invoke('email:send-backup', encrypted)

      setBackupResult({ emailed: sendResult?.sent || false, filePath: sendResult?.filePath })

      // 8. Delete all entries
      for (const entry of entries) {
        await invoke('entries:force-delete', entry.id)
      }

      // 9. Clear panic key
      await invoke('entries:complete-panic')

      const msg = sendResult?.sent
        ? `Encrypted backup sent to Telegram`
        : `Encrypted backup saved${sendResult?.filePath ? '' : ''}`
      addToast(msg + '. All data wiped.', 'success')
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

        {/* Show result after backup */}
        {backupResult && (
          <div className="bg-vault-surface border border-vault-border rounded-xl p-4 space-y-3 text-left">
            {backupResult.emailed ? (
              <div className="flex items-center gap-2 text-green-400">
                <Mail size={16} />
                <p className="text-xs font-medium">Encrypted backup sent to Telegram</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-medium text-vault-text-secondary">Backup saved. Decrypt with your backup password.</p>
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

// Simple AES-GCM encryption using Web Crypto API
async function encryptText(text: string, password: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(text)
  )

  // Combine salt + iv + ciphertext into one base64 string
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)

  return btoa(String.fromCharCode(...combined))
}
