import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { OtpInput } from '../ui/OtpInput'
import { QRCodeSVG } from 'qrcode.react'
import { invoke, invalidateClipboardTtlCache } from '../../lib/ipc'
import { useUIStore } from '../../store/uiStore'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { BackupDialog } from '../import-export/BackupDialog'
import { PanicBackupImportDialog } from '../import-export/PanicBackupImportDialog'
import { SecurityHealth } from '../health/SecurityHealth'
import { SyncSettings } from './SyncSettings'
import { EmergencyAccess } from '../health/EmergencyAccess'
import { Shield, Palette, Info, ChevronRight } from 'lucide-react'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'security' | 'appearance' | 'about'

export function SettingsPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('security')
  const { theme, setTheme } = useUIStore()
  const { t } = useI18n()

  return (
    <Modal open={open} onClose={onClose} title={t('settings_title')} maxWidth="max-w-xl">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-vault-bg rounded-lg mb-6">
        {([
          { key: 'security' as Tab, icon: Shield, label: t('tab_security') },
          { key: 'appearance' as Tab, icon: Palette, label: t('tab_appearance') },
          { key: 'about' as Tab, icon: Info, label: t('tab_about') },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-vault-surface text-vault-text shadow-sm'
                : 'text-vault-text-secondary hover:text-vault-text'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'security' && <SecurityTab />}
      {tab === 'appearance' && <AppearanceTab theme={theme} setTheme={setTheme} />}
      {tab === 'about' && <AboutTab />}
    </Modal>
  )
}

// ─── Settings Section Card ──────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-vault-border bg-vault-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-vault-border">
        <h3 className="text-xs font-semibold text-vault-text-secondary uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-vault-border">{children}</div>
    </div>
  )
}

function SettingsRow({
  label,
  description,
  onClick,
  children,
}: {
  label: string
  description?: string
  onClick?: () => void
  children?: React.ReactNode
}) {
  const content = (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-vault-text">{label}</p>
        {description && <p className="text-xs text-vault-text-secondary mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )

  if (onClick && !children) {
    return (
      <button onClick={onClick} className="w-full text-left hover:bg-vault-bg/50 transition-colors">
        {content}
      </button>
    )
  }

  return <div>{content}</div>
}

// ─── Security Tab ───────────────────────────────────────

function SecurityTab() {
  const isMobile = useIsMobile()
  const { t } = useI18n()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showSetupTOTP, setShowSetupTOTP] = useState(false)
  const [showDisableTOTP, setShowDisableTOTP] = useState(false)
  const [showAlarmSetup, setShowAlarmSetup] = useState(false)
  const [showBackupExport, setShowBackupExport] = useState(false)
  const [showBackupImport, setShowBackupImport] = useState(false)
  const [showPanicBackupImport, setShowPanicBackupImport] = useState(false)
  const [showSecurityHealth, setShowSecurityHealth] = useState(false)
  const [showEmergencyAccess, setShowEmergencyAccess] = useState(false)
  const [showTelegramSetup, setShowTelegramSetup] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [alarmEnabled, setAlarmEnabled] = useState(false)
  const [autoLockMs, setAutoLockMs] = useState('300000')
  const [clipboardTtlMs, setClipboardTtlMs] = useState('30000')
  const [globalShortcut, setGlobalShortcut] = useState('CommandOrControl+Shift+Space')
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    try {
      const lockMs = await invoke('settings:get', 'auto_lock_ms')
      if (lockMs) setAutoLockMs(lockMs)
      const totpData = await invoke('settings:get', 'totp_enabled')
      if (totpData === 'true' || totpData === '1') setTotpEnabled(true)
      const alarmData = await invoke('settings:get', 'alarm_enabled')
      if (alarmData === 'true' || alarmData === '1') setAlarmEnabled(true)
      const ttlData = await invoke('settings:get', 'clipboard_ttl_ms')
      if (ttlData) setClipboardTtlMs(ttlData)
      if (!isMobile) {
        const shortcut = await invoke('shortcut:get')
        if (shortcut) setGlobalShortcut(shortcut)
      }
    } catch {}
  }

  const handleAutoLockChange = async (ms: string) => {
    setAutoLockMs(ms)
    await invoke('settings:set', 'auto_lock_ms', ms)
    addToast(t('settings_auto_lock_desc'), 'success')
  }

  const handleClipboardTtlChange = async (ms: string) => {
    setClipboardTtlMs(ms)
    await invoke('settings:set', 'clipboard_ttl_ms', ms)
    invalidateClipboardTtlCache()
    addToast('Время жизни буфера обновлено', 'success')
  }

  const handleRemoveAlarm = async () => {
    if (!confirm('Remove duress code? This cannot be undone.')) return
    try {
      await invoke('vault:remove-alarm')
      setAlarmEnabled(false)
      addToast('Код принуждения удалён', 'success')
    } catch {
      addToast('Не удалось удалить код принуждения', 'error')
    }
  }

  const handleClearClipboard = async () => {
    try {
      await invoke('clipboard:clear')
      addToast('Буфер обмена очищен', 'success')
    } catch {
      addToast('Не удалось очистить буфер', 'error')
    }
  }

  const handleShortcutChange = async (shortcut: string) => {
    const result = await invoke('shortcut:set', shortcut)
    if (result.success) {
      setGlobalShortcut(shortcut)
      addToast('Горячая клавиша обновлена', 'success')
    } else {
      addToast(result.error || 'Failed to update shortcut', 'error')
    }
  }

  const autoLockOptions = [
    { value: '60000', label: t('settings_1min') },
    { value: '300000', label: t('settings_5min') },
    { value: '900000', label: t('settings_15min') },
    { value: '1800000', label: t('settings_30min') },
    { value: '3600000', label: t('settings_1hour') },
  ]

  const clipboardTtlOptions = [
    { value: '10000', label: '10 сек' },
    { value: '30000', label: '30 сек' },
    { value: '60000', label: '1 мин' },
    { value: '120000', label: '2 мин' },
    { value: '300000', label: '5 мин' },
    { value: '0', label: 'Не очищать' },
  ]

  const shortcutPresets = [
    'CommandOrControl+Shift+Space',
    'CommandOrControl+Shift+X',
    'CommandOrControl+Alt+Space',
    'CommandOrControl+Shift+C',
  ]

  return (
    <div className="space-y-4">
      {/* ── Vault Group ── */}
      <SettingsSection title={t('settings_group_vault')}>
        <SettingsRow label={t('settings_change_master_password')} description={t('settings_master_password_desc')}>
          <Button variant="secondary" size="sm" onClick={() => setShowChangePassword(true)}>
            <ChevronRight size={16} />
          </Button>
        </SettingsRow>

        <SettingsRow label={t('auto_lock')} description={t('settings_auto_lock_desc')}>
          <select
            value={autoLockMs}
            onChange={(e) => handleAutoLockChange(e.target.value)}
            className="h-8 px-2 rounded-lg bg-vault-bg border border-vault-border text-xs text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
          >
            {autoLockOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </SettingsRow>

        <SettingsRow label={t('duress_code')} description={t('settings_duress_desc')}>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAlarmSetup(true)}>
              {alarmEnabled ? t('settings_change_duress') : t('settings_set_duress')}
            </Button>
            {alarmEnabled && (
              <Button variant="danger" size="sm" onClick={handleRemoveAlarm}>
                {t('settings_remove_duress')}
              </Button>
            )}
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* ── Authentication Group ── */}
      <SettingsSection title={t('settings_group_auth')}>
        <SettingsRow label={t('settings_security_health')} description={t('settings_security_health_desc')}>
          <Button variant="secondary" size="sm" onClick={() => setShowSecurityHealth(true)}>
            {t('settings_analyze_passwords')}
          </Button>
        </SettingsRow>

        <SettingsRow label={t('totp_enabled')} description={t('settings_totp_desc')}>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowSetupTOTP(true)}>
              {totpEnabled ? t('settings_manage_2fa') : t('settings_enable_2fa')}
            </Button>
            {totpEnabled && (
              <Button variant="danger" size="sm" onClick={() => setShowDisableTOTP(true)}>
                {t('settings_disable_2fa')}
              </Button>
            )}
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* ── Data & Backup Group ── */}
      {!isMobile && (
        <SettingsSection title={t('settings_group_data')}>
          <SettingsRow label={t('settings_clipboard')} description={t('settings_clipboard_desc')}>
            <div className="flex items-center gap-2">
              <select
                value={clipboardTtlMs}
                onChange={(e) => handleClipboardTtlChange(e.target.value)}
                className="h-8 px-2 rounded-lg bg-vault-bg border border-vault-border text-xs text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
              >
                {clipboardTtlOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={handleClearClipboard}>
                {t('settings_clear_clipboard')}
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('backup_export')} description={t('settings_backup_desc')}>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowBackupExport(true)}>
                {t('settings_export_backup')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowBackupImport(true)}>
                {t('settings_import_backup')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowPanicBackupImport(true)}>
                Panic Backup
              </Button>
            </div>
          </SettingsRow>

          <div className="px-4 py-3">
            <p className="text-sm font-medium text-vault-text mb-1">{t('cloud_sync')}</p>
            <p className="text-xs text-vault-text-secondary mb-3">{t('settings_sync_desc')}</p>
            <SyncSettings />
          </div>

          <SettingsRow label={t('emergency_access')} description={t('settings_emergency_desc')}>
            <Button variant="secondary" size="sm" onClick={() => setShowEmergencyAccess(true)}>
              {t('settings_setup_emergency')}
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      {/* ── Notifications Group ── */}
      {!isMobile && (
        <SettingsSection title="Уведомления">
          <SettingsRow label="Telegram уведомления" description="Получайте уведомления о утечках паролей в Telegram">
            <Button variant="secondary" size="sm" onClick={() => setShowTelegramSetup(true)}>
              Настроить
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      {/* ── Mobile: Clipboard only ── */}
      {isMobile && (
        <SettingsSection title={t('settings_group_misc')}>
          <SettingsRow label={t('settings_clipboard')} description={t('settings_clipboard_desc')}>
            <div className="flex items-center gap-2">
              <select
                value={clipboardTtlMs}
                onChange={(e) => handleClipboardTtlChange(e.target.value)}
                className="h-8 px-2 rounded-lg bg-vault-bg border border-vault-border text-xs text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
              >
                {clipboardTtlOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={handleClearClipboard}>
                {t('settings_clear_clipboard')}
              </Button>
            </div>
          </SettingsRow>
        </SettingsSection>
      )}

      {/* ── Global Shortcut (desktop only) ── */}
      {!isMobile && (
        <SettingsSection title={t('global_shortcut')}>
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-vault-text-secondary">{t('settings_global_shortcut_desc')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={recordingShortcut ? t('settings_press_keys') : formatShortcut(globalShortcut)}
                readOnly
                className="flex-1 h-9 px-3 rounded-lg bg-vault-bg border border-vault-border text-sm text-vault-text focus:outline-none"
              />
              <Button
                variant={recordingShortcut ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => setRecordingShortcut(!recordingShortcut)}
              >
                {recordingShortcut ? t('settings_cancel') : t('settings_record')}
              </Button>
            </div>
            {recordingShortcut && (
              <ShortcutRecorder
                onRecord={(shortcut) => {
                  setRecordingShortcut(false)
                  handleShortcutChange(shortcut)
                }}
              />
            )}
            <div className="flex flex-wrap gap-1">
              {shortcutPresets.map((s) => (
                <button
                  key={s}
                  onClick={() => handleShortcutChange(s)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    globalShortcut === s
                      ? 'bg-vault-accent/10 border-vault-accent text-vault-accent'
                      : 'bg-vault-bg border-vault-border text-vault-text-secondary hover:text-vault-text'
                  }`}
                >
                  {formatShortcut(s)}
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>
      )}

      {/* ── Modals ── */}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showSetupTOTP && <TOTPSetupModal onClose={() => setShowSetupTOTP(false)} onStatusChange={setTotpEnabled} />}
      {showAlarmSetup && <AlarmSetupModal onClose={() => setShowAlarmSetup(false)} onStatusChange={setAlarmEnabled} />}
      {showDisableTOTP && <DisableTOTPModal onClose={() => setShowDisableTOTP(false)} onStatusChange={setTotpEnabled} />}
      {showBackupExport && <BackupDialog mode="export" open={showBackupExport} onClose={() => setShowBackupExport(false)} />}
      {showBackupImport && <BackupDialog mode="import" open={showBackupImport} onClose={() => setShowBackupImport(false)} />}
      {showPanicBackupImport && <PanicBackupImportDialog open={showPanicBackupImport} onClose={() => setShowPanicBackupImport(false)} />}
      {showSecurityHealth && <SecurityHealth open={showSecurityHealth} onClose={() => setShowSecurityHealth(false)} />}
      {showEmergencyAccess && <EmergencyAccess open={showEmergencyAccess} onClose={() => setShowEmergencyAccess(false)} />}
      {showTelegramSetup && <TelegramSetupModal onClose={() => setShowTelegramSetup(false)} />}
    </div>
  )
}

// ─── Sub-modals ─────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  const handleSubmit = async () => {
    if (!oldPwd || !newPwd) { addToast('Заполните все поля', 'warning'); return }
    if (newPwd !== confirmPwd) { addToast('Пароли не совпадают', 'warning'); return }
    if (newPwd.length < 8) { addToast('Пароль должен быть не менее 8 символов', 'warning'); return }
    setLoading(true)
    try {
      const result = await invoke('vault:change-master-password', oldPwd, newPwd)
      if (result.success) { addToast('Мастер-пароль изменён', 'success'); onClose() }
      else addToast(result.error || 'Failed', 'error')
    } catch { addToast('Не удалось изменить пароль', 'error') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-vault-text">{t('settings_change_master_password')}</h3>
        <Input label={t('current_password')} type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} showPasswordToggle />
        <Input label={t('new_password')} type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} showPasswordToggle />
        <Input label={t('confirm_password')} type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} showPasswordToggle />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('settings_cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? '...' : t('update_password')}</Button>
        </div>
      </div>
    </div>
  )
}

function TOTPSetupModal({ onClose, onStatusChange }: { onClose: () => void; onStatusChange?: (enabled: boolean) => void }) {
  const [secret, setSecret] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [step, setStep] = useState<'init' | 'verify'>('init')
  const addToast = useToastStore((s) => s.addToast)

  const handleEnable = async () => {
    try {
      const result = await invoke('vault:enable-totp')
      setSecret(result.secret); setQrUrl(result.qrCodeUrl); setStep('verify')
    } catch { addToast('Не удалось сгенерировать секрет TOTP', 'error') }
  }

  const handleVerify = async (code: string): Promise<boolean> => {
    const success = await invoke('vault:verify-totp', code)
    if (success) { addToast('2FA enabled successfully', 'success'); onStatusChange?.(true); onClose(); return true }
    addToast('Неверный код', 'error'); return false
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        {step === 'init' ? (
          <>
            <h3 className="text-lg font-semibold text-vault-text">{t('totp_enabled')}</h3>
            <p className="text-sm text-vault-text-secondary">{t('settings_totp_desc')}</p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleEnable}>Enable</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-vault-text">Verify 2FA Setup</h3>
            <p className="text-sm text-vault-text-secondary">Scan this QR code with your authenticator app, then enter the code below.</p>
            {qrUrl && (
              <div className="flex justify-center py-2">
                <QRCodeSVG value={qrUrl} size={180} bgColor="transparent" fgColor="var(--vault-text)" />
              </div>
            )}
            <div className="p-3 rounded-lg bg-vault-bg border border-vault-border">
              <p className="text-xs text-vault-text-secondary mb-1">Or enter this key manually:</p>
              <p className="font-mono text-sm text-vault-text break-all select-all">{secret}</p>
            </div>
            <div className="flex justify-center py-2">
              <OtpInput length={6} onComplete={handleVerify} />
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DisableTOTPModal({ onClose, onStatusChange }: { onClose: () => void; onStatusChange?: (enabled: boolean) => void }) {
  const addToast = useToastStore((s) => s.addToast)

  const handleVerify = async (code: string): Promise<boolean> => {
    const success = await invoke('vault:disable-totp', code)
    if (success) { addToast('2FA disabled', 'success'); onStatusChange?.(false); onClose(); return true }
    addToast('Неверный код', 'error'); return false
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-vault-text">Disable 2FA</h3>
        <p className="text-sm text-vault-text-secondary">Enter your current 6-digit code to disable two-factor authentication.</p>
        <div className="flex justify-center py-2">
          <OtpInput length={6} onComplete={handleVerify} />
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

function AlarmSetupModal({ onClose, onStatusChange }: { onClose: () => void; onStatusChange?: (enabled: boolean) => void }) {
  const [alarmPassword, setAlarmPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [backupPassword, setBackupPassword] = useState('')
  const [confirmBackup, setConfirmBackup] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [botName, setBotName] = useState('')
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  const testTelegram = async () => {
    if (!telegramToken) return
    setTesting(true)
    try {
      const result = await invoke('email:test-telegram', telegramToken)
      if (result?.ok) {
        setBotName(result.botName || '')
        // Try auto-detect chat ID
        const detected = await invoke('email:get-chat-id', telegramToken)
        if (detected) setChatId(detected)
        addToast(`Bot connected: @${result.botName}`, 'success')
      } else {
        addToast(result?.error || 'Invalid token', 'error')
      }
    } catch {
      addToast('Ошибка подключения', 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    if (!alarmPassword) { addToast('Введите пароль', 'warning'); return }
    if (alarmPassword !== confirmPassword) { addToast('Пароли не совпадают', 'warning'); return }
    if (alarmPassword.length < 4) { addToast('Пароль должен быть не менее 4 символов', 'warning'); return }
    if (!backupPassword) { addToast('Введите пароль для бэкапа', 'warning'); return }
    if (backupPassword !== confirmBackup) { addToast('Пароли бэкапа не совпадают', 'warning'); return }
    setLoading(true)
    try {
      await invoke('settings:set-secure', 'panic_backup_password', backupPassword)

      // Save Telegram config if provided
      if (telegramToken && chatId) {
        await invoke('email:save-telegram', telegramToken, chatId)
      }

      const result = await invoke('vault:setup-alarm', alarmPassword)
      if (result.success) {
        addToast('Код принуждения настроен', 'success')
        onStatusChange?.(true)
        onClose()
      } else {
        addToast(result.error || 'Failed', 'error')
      }
    } catch {
      addToast('Не удалось настроить код принуждения', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-vault-text">{t('setup_duress')}</h3>
        <p className="text-sm text-vault-text-secondary">{t('duress_description')}</p>
        <Input label={t('duress_password')} type="password" value={alarmPassword} onChange={(e) => setAlarmPassword(e.target.value)} showPasswordToggle />
        <Input label={t('confirm_password')} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} showPasswordToggle />

        <div className="border-t border-vault-border pt-4 space-y-3">
          <p className="text-xs font-medium text-vault-text-secondary">Backup encryption</p>
          <Input label="Backup password" type="password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} showPasswordToggle />
          <Input label="Confirm backup password" type="password" value={confirmBackup} onChange={(e) => setConfirmBackup(e.target.value)} showPasswordToggle />
        </div>

        <div className="border-t border-vault-border pt-4 space-y-3">
          <p className="text-xs font-medium text-vault-text-secondary">Send backup to Telegram (optional)</p>
          <p className="text-[10px] text-vault-text-secondary">
            1. Message @BotFather → /newbot → copy token<br/>
            2. Message your bot → /start<br/>
            3. Paste token below, click Test
          </p>
          <Input label="Bot Token" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} placeholder="123456789:ABCdef..." />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={testTelegram} disabled={testing || !telegramToken} className="flex-1">
              {testing ? '...' : 'Test'}
            </Button>
          </div>
          {botName && <p className="text-[10px] text-green-400">Connected: @{botName}</p>}
          <Input label="Chat ID" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Auto-detected or paste manually" />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('settings_cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? '...' : t('settings_set_duress')}</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Telegram Setup Modal ────────────────────────────────

function TelegramSetupModal({ onClose }: { onClose: () => void }) {
  const [telegramToken, setTelegramToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [botName, setBotName] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  useEffect(() => {
    // Load existing config
    const loadConfig = async () => {
      try {
        const savedToken = await invoke('settings:get-secure', 'telegram_bot_token')
        const savedChatId = await invoke('settings:get-secure', 'telegram_chat_id')
        if (savedToken) setTelegramToken(savedToken)
        if (savedChatId) setChatId(savedChatId)
      } catch {}
    }
    loadConfig()
  }, [])

  const testTelegram = async () => {
    if (!telegramToken) return
    setTesting(true)
    try {
      const result = await invoke('email:test-telegram', telegramToken)
      if (result?.ok) {
        setBotName(result.botName || '')
        const detected = await invoke('email:get-chat-id', telegramToken)
        if (detected) setChatId(detected)
        addToast(`Бот подключён: @${result.botName}`, 'success')
      } else {
        addToast(result?.error || 'Неверный токен', 'error')
      }
    } catch {
      addToast('Ошибка подключения', 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!telegramToken || !chatId) {
      addToast('Введите токен и Chat ID', 'warning')
      return
    }
    setSaving(true)
    try {
      await invoke('email:save-telegram', telegramToken, chatId)
      addToast('Telegram настроен', 'success')
      onClose()
    } catch {
      addToast('Не удалось сохранить', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-vault-text">Telegram уведомления</h3>
        <p className="text-xs text-vault-text-secondary">
          Получайте уведомления о утечках паролей в Telegram.
        </p>

        <div className="space-y-3">
          <p className="text-xs text-vault-text-secondary">
            1. Создайте бота через @BotFather<br/>
            2. Получите токен<br/>
            3. Отправьте любое сообщение боту<br/>
            4. Вставьте токен и нажмите Тест
          </p>
          <Input label="Bot Token" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} placeholder="123456789:ABCdef..." />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={testTelegram} disabled={testing || !telegramToken} className="flex-1">
              {testing ? '...' : 'Тест'}
            </Button>
          </div>
          {botName && <p className="text-[10px] text-green-400">Подключён: @{botName}</p>}
          <Input label="Chat ID" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Автоопределён или вставьте вручную" />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('settings_cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? '...' : 'Сохранить'}</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Appearance Tab ─────────────────────────────────────

function AppearanceTab({ theme, setTheme }: { theme: string; setTheme: (t: 'dark' | 'light') => void }) {
  const { locale, setLocale, t } = useI18n()
  const { fontSize, setFontSize } = useUIStore()

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-vault-text block mb-3">{t('theme_label')}</label>
        <div className="flex gap-3">
          {(['dark', 'light'] as const).map((th) => (
            <button
              key={th}
              onClick={() => setTheme(th)}
              className={`flex-1 h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                theme === th
                  ? 'border-vault-accent bg-vault-accent/10'
                  : 'border-vault-border bg-vault-surface hover:border-vault-accent/30'
              }`}
            >
              <div className={`w-12 h-8 rounded-md ${th === 'dark' ? 'bg-[#1a1a24]' : 'bg-[#f8f9fc] border border-gray-200'}`} />
              <span className="text-xs font-medium text-vault-text capitalize">{t(th === 'dark' ? 'dark' : 'light')}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-vault-text block mb-3">{t('font_size')}</label>
        <div className="flex gap-3">
          {([
            { key: 'small' as const, label: t('small') },
            { key: 'normal' as const, label: t('normal') },
            { key: 'large' as const, label: t('large') },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFontSize(key)}
              className={`flex-1 h-12 rounded-xl border-2 flex items-center justify-center text-sm font-medium transition-all ${
                fontSize === key
                  ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                  : 'border-vault-border bg-vault-surface text-vault-text hover:border-vault-accent/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-vault-text block mb-3">{t('language_label')}</label>
        <div className="flex gap-3">
          {([
            { key: 'en' as const, label: 'English' },
            { key: 'ru' as const, label: 'Русский' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setLocale(key)}
              className={`flex-1 h-12 rounded-xl border-2 flex items-center justify-center text-sm font-medium transition-all ${
                locale === key
                  ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                  : 'border-vault-border bg-vault-surface text-vault-text hover:border-vault-accent/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── About Tab ──────────────────────────────────────────

function AboutTab() {
  const { t } = useI18n()
  const addToast = useToastStore((s) => s.addToast)

  const exportSettings = () => {
    const settings = {
      theme: localStorage.getItem('theme'),
      fontSize: localStorage.getItem('fontSize'),
      generatorPresets: localStorage.getItem('generator_presets'),
      healthHistory: localStorage.getItem('health_history'),
    }
    const data = JSON.stringify(settings, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ciphervault-settings.json'
    a.click()
    URL.revokeObjectURL(url)
    addToast(t('settings_exported'), 'success')
  }

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const settings = JSON.parse(event.target?.result as string)
        if (settings.theme) localStorage.setItem('theme', settings.theme)
        if (settings.fontSize) localStorage.setItem('fontSize', settings.fontSize)
        if (settings.generatorPresets) localStorage.setItem('generator_presets', settings.generatorPresets)
        if (settings.healthHistory) localStorage.setItem('health_history', settings.healthHistory)
        addToast(t('settings_imported'), 'success')
        window.location.reload()
      } catch {
        addToast(t('import_failed'), 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center mx-auto">
        <Shield size={32} className="text-vault-accent" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-vault-text">{t('about_title')}</h3>
        <p className="text-sm text-vault-text-secondary">{t('about_subtitle')}</p>
        <p className="text-xs text-vault-text-secondary mt-1">{t('version')} 14.0.4</p>
      </div>
      <div className="p-4 rounded-xl bg-vault-bg border border-vault-border text-left">
        <p className="text-xs text-vault-text-secondary leading-relaxed">{t('about_description')}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={exportSettings}
          className="flex-1 py-2 px-3 rounded-lg bg-vault-surface border border-vault-border text-xs font-medium text-vault-text hover:bg-vault-surface-hover transition-colors"
        >
          {t('export_settings')}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2 px-3 rounded-lg bg-vault-surface border border-vault-border text-xs font-medium text-vault-text hover:bg-vault-surface-hover transition-colors"
        >
          {t('import_settings')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={importSettings}
          className="hidden"
        />
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('CommandOrControl', 'Ctrl')
    .replace('Control', 'Ctrl')
    .replace('Meta', 'Cmd')
    .replace(/\+/g, ' + ')
}

function ShortcutRecorder({ onRecord }: { onRecord: (shortcut: string) => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      const key = e.key.toLowerCase()
      if (!['control', 'meta', 'alt', 'shift'].includes(key)) {
        parts.push(e.key.toUpperCase())
        onRecord(parts.join('+'))
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onRecord])

  return (
    <div className="mt-2 p-3 rounded-lg bg-vault-accent/10 border border-vault-accent/30 text-center">
      <p className="text-sm text-vault-accent font-medium">Press your desired key combination...</p>
      <p className="text-xs text-vault-text-secondary mt-1">Release all keys when done</p>
    </div>
  )
}
