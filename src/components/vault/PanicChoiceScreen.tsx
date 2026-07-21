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
    if (loading) return
    setLoading(true)
    try {
      // 1. Get backup password
      const backupPassword = await invoke('settings:get-secure', 'panic_backup_password')
      if (!backupPassword) {
        addToast('Пароль бэкапа не настроен', 'error')
        setLoading(false)
        return
      }

      // 2. Get entries (encrypted — duress mode can't decrypt with panic key)
      const entries = await invoke('entries:panic-backup')

      if (!entries || entries.length === 0) {
        addToast('Нет записей для удаления', 'warning')
        onChoice('wipe')
        return
      }

      // 3. Get vault's kdf_salt for import restoration
      const vaultStatus = await invoke('vault:status') as { activeVaultId: number }
      const kdfSalt = await invoke('vault:get-kdf-salt', vaultStatus.activeVaultId) as string | null

      // 4. Create backup JSON with encrypted entries + salt for restoration
      const backupJson = JSON.stringify({
        format: 'ciphervault-panic-backup',
        version: '2.0',
        timestamp: new Date().toISOString(),
        entryCount: entries.length,
        kdf_salt: kdfSalt,
        entries: entries.map((e) => ({
          id: e.id,
          entry_type: e.entry_type,
          display_title: e.display_title,
          iv: e.iv,
          encrypted_data: e.encrypted_data,
          auth_tag: e.auth_tag,
        })),
      }, null, 2)

      // 6. Encrypt backup with password
      const encrypted = await encryptText(backupJson, backupPassword)

      // 7. Send via Telegram or save to file
      const sendResult = await invoke('email:send-backup', encrypted)

      setBackupResult({ emailed: sendResult?.sent || false, filePath: sendResult?.filePath })

      // 8. Delete all entries (track success)
      let deleted = 0
      for (const entry of entries) {
        try {
          await invoke('entries:force-delete', entry.id)
          deleted++
        } catch {
          // Continue deleting other entries
        }
      }

      // 9. Clear panic key
      await invoke('entries:complete-panic')

      const msg = sendResult?.sent
        ? `Encrypted backup sent to Telegram`
        : `Encrypted backup saved${sendResult?.filePath ? '' : ''}`
      addToast(msg + '. Все данные удалены.', 'success')
    } catch (err: any) {
      console.error('Panic backup failed:', err)
      addToast('Ошибка бэкапа: ' + (err.message || 'Неизвестная ошибка'), 'error')
      try {
        const entries = await invoke('entries:panic-backup')
        for (const entry of entries) {
          await invoke('entries:force-delete', entry.id)
        }
        await invoke('entries:complete-panic')
        addToast('Данные удалены (бэкап не удался)', 'warning')
      } catch (deleteErr) {
        console.error('Fallback delete also failed:', deleteErr)
        addToast('Не удалось удалить записи. Попробуйте снова.', 'error')
      }
      onChoice('wipe')
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

  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
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

  return btoa(Array.from(combined, b => String.fromCharCode(b)).join(''))
}
