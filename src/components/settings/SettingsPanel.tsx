import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { OtpInput } from '../ui/OtpInput'
import { QRCodeSVG } from 'qrcode.react'
import { invoke } from '../../lib/ipc'
import { useUIStore } from '../../store/uiStore'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { BackupDialog } from '../import-export/BackupDialog'
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
  const [showSecurityHealth, setShowSecurityHealth] = useState(false)
  const [showEmergencyAccess, setShowEmergencyAccess] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [alarmEnabled, setAlarmEnabled] = useState(false)
  const [autoLockMs, setAutoLockMs] = useState('300000')
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

  const handleRemoveAlarm = async () => {
    if (!confirm('Remove duress code? This cannot be undone.')) return
    try {
      await invoke('vault:remove-alarm')
      setAlarmEnabled(false)
      addToast('Duress code removed', 'success')
    } catch {
      addToast('Failed to remove duress code', 'error')
    }
  }

  const handleClearClipboard = async () => {
    try {
      await invoke('clipboard:clear')
      addToast('Clipboard cleared', 'success')
    } catch {
      addToast('Failed to clear clipboard', 'error')
    }
  }

  const handleShortcutChange = async (shortcut: string) => {
    const result = await invoke('shortcut:set', shortcut)
    if (result.success) {
      setGlobalShortcut(shortcut)
      addToast('Global shortcut updated', 'success')
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
            <Button variant="secondary" size="sm" onClick={handleClearClipboard}>
              {t('settings_clear_clipboard')}
            </Button>
          </SettingsRow>

          <SettingsRow label={t('backup_export')} description={t('settings_backup_desc')}>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowBackupExport(true)}>
                {t('settings_export_backup')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowBackupImport(true)}>
                {t('settings_import_backup')}
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

      {/* ── Mobile: Clipboard only ── */}
      {isMobile && (
        <SettingsSection title={t('settings_group_misc')}>
          <SettingsRow label={t('settings_clipboard')} description={t('settings_clipboard_desc')}>
            <Button variant="secondary" size="sm" onClick={handleClearClipboard}>
              {t('settings_clear_clipboard')}
            </Button>
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
      {showSecurityHealth && <SecurityHealth open={showSecurityHealth} onClose={() => setShowSecurityHealth(false)} />}
      {showEmergencyAccess && <EmergencyAccess open={showEmergencyAccess} onClose={() => setShowEmergencyAccess(false)} />}
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
    if (!oldPwd || !newPwd) { addToast('Fill in all fields', 'warning'); return }
    if (newPwd !== confirmPwd) { addToast('Passwords do not match', 'warning'); return }
    if (newPwd.length < 8) { addToast('Password must be at least 8 characters', 'warning'); return }
    setLoading(true)
    try {
      const result = await invoke('vault:change-master-password', oldPwd, newPwd)
      if (result.success) { addToast('Master password changed', 'success'); onClose() }
      else addToast(result.error || 'Failed', 'error')
    } catch { addToast('Failed to change password', 'error') }
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
    } catch { addToast('Failed to generate TOTP secret', 'error') }
  }

  const handleVerify = async (code: string): Promise<boolean> => {
    const success = await invoke('vault:verify-totp', code)
    if (success) { addToast('2FA enabled successfully', 'success'); onStatusChange?.(true); onClose(); return true }
    addToast('Invalid code', 'error'); return false
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
    addToast('Invalid code', 'error'); return false
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
  const [backupEmail, setBackupEmail] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  const handleSubmit = async () => {
    if (!alarmPassword) { addToast('Password is required', 'warning'); return }
    if (alarmPassword !== confirmPassword) { addToast('Passwords do not match', 'warning'); return }
    if (alarmPassword.length < 4) { addToast('Password must be at least 4 characters', 'warning'); return }
    if (!backupEmail || !backupEmail.includes('@')) { addToast('Valid email is required for panic backup', 'warning'); return }
    setLoading(true)
    try {
      // Save SMTP config if provided
      if (smtpHost && smtpUser && smtpPass) {
        await invoke('email:set-smtp', {
          host: smtpHost,
          port: parseInt(smtpPort) || 587,
          secure: parseInt(smtpPort) === 465,
          user: smtpUser,
          pass: smtpPass,
        })
      }

      const result = await invoke('vault:setup-alarm', alarmPassword, backupEmail)
      if (result.success) {
        addToast('Duress code set up', 'success')
        onStatusChange?.(true)
        onClose()
      } else {
        addToast(result.error || 'Failed', 'error')
      }
    } catch {
      addToast('Failed to set up duress code', 'error')
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
        <div>
          <Input label={t('panic_backup_email')} type="email" value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} placeholder="your@email.com" />
          <p className="text-[10px] text-vault-text-secondary mt-1">{t('panic_backup_email_hint')}</p>
        </div>

        {/* SMTP Settings */}
        <div className="border-t border-vault-border pt-4 space-y-3">
          <p className="text-xs font-medium text-vault-text-secondary">SMTP for auto-send (optional)</p>
          <Input label="SMTP Host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          <Input label="Port" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
          <Input label="Email / Login" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="you@gmail.com" />
          <Input label="Password / App Password" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} showPasswordToggle />
          <p className="text-[10px] text-vault-text-secondary">For Gmail: generate an App Password in Google Account settings</p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('settings_cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? '...' : t('settings_set_duress')}</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Appearance Tab ─────────────────────────────────────

function AppearanceTab({ theme, setTheme }: { theme: string; setTheme: (t: 'dark' | 'light') => void }) {
  const { locale, setLocale, t } = useI18n()

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
  return (
    <div className="space-y-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center mx-auto">
        <Shield size={32} className="text-vault-accent" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-vault-text">{t('about_title')}</h3>
        <p className="text-sm text-vault-text-secondary">{t('about_subtitle')}</p>
        <p className="text-xs text-vault-text-secondary mt-1">{t('version')} 12.1.0</p>
      </div>
      <div className="p-4 rounded-xl bg-vault-bg border border-vault-border text-left">
        <p className="text-xs text-vault-text-secondary leading-relaxed">{t('about_description')}</p>
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
    .replace('Alt', 'Alt')
    .replace('Shift', 'Shift')
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
