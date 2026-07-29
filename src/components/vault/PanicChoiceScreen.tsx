import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, Trash2, Mail } from 'lucide-react'
import { useToastStore } from '../ui/Toast'

interface Props {
  onDone: () => void
}

// Duress mode gives no choice: the moment it activates, real data is
// backed up (best-effort) to Telegram and then permanently deleted.
// A missing/failed backup must never block the wipe — losing the backup
// is an acceptable tradeoff, leaving the real data behind under duress is not.
export function PanicChoiceScreen({ onDone }: Props) {
  const { t } = useI18n()
  const [backupResult, setBackupResult] = useState<{ emailed?: boolean; filePath?: string } | null>(null)
  const addToast = useToastStore((s) => s.addToast)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void wipeAndBackup()
  }, [])

  const wipeAndBackup = async () => {
    let entries: any[] = []
    try {
      entries = await invoke('entries:panic-backup')
    } catch {
      entries = []
    }

    try {
      if (entries && entries.length > 0) {
        const backupPassword = await invoke('settings:get-secure', 'panic_backup_password')
        if (backupPassword) {
          const vaultStatus = await invoke('vault:status') as { activeVaultId: number }
          const kdfSalt = await invoke('vault:get-kdf-salt', vaultStatus.activeVaultId) as string | null

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

          const encrypted = await encryptText(backupJson, backupPassword)
          const sendResult = await invoke('email:send-backup', encrypted)
          setBackupResult({ emailed: sendResult?.sent || false, filePath: sendResult?.filePath })
        }
      }
    } catch (err) {
      console.error('Panic backup failed, deleting data anyway:', err)
    }

    // Delete everything regardless of whether the backup succeeded.
    for (const entry of entries) {
      try {
        await invoke('entries:force-delete', entry.id)
      } catch {
        // Continue deleting other entries
      }
    }

    try {
      await invoke('entries:complete-panic')
    } catch {}

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
