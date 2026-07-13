import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { OtpInput } from '../ui/OtpInput'
import { QRCodeSVG } from 'qrcode.react'
import { invoke } from '../../lib/ipc'
import { useUIStore } from '../../store/uiStore'
import { useToastStore } from '../ui/Toast'
import { Shield, Palette, Info } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'security' | 'appearance' | 'about'

export function SettingsPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('security')
  const { theme, setTheme } = useUIStore()
  const addToast = useToastStore((s) => s.addToast)

  return (
    <Modal open={open} onClose={onClose} title="Settings" maxWidth="max-w-xl">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-vault-bg rounded-lg mb-6">
        {([
          { key: 'security' as Tab, icon: Shield, label: 'Security' },
          { key: 'appearance' as Tab, icon: Palette, label: 'Appearance' },
          { key: 'about' as Tab, icon: Info, label: 'About' },
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

function SecurityTab() {
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showSetupTOTP, setShowSetupTOTP] = useState(false)
  const [showDisableTOTP, setShowDisableTOTP] = useState(false)
  const [showAlarmSetup, setShowAlarmSetup] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [alarmEnabled, setAlarmEnabled] = useState(false)
  const [autoLockMs, setAutoLockMs] = useState('300000')
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const lockMs = await invoke('settings:get', 'auto_lock_ms')
      if (lockMs) setAutoLockMs(lockMs)

      // Load TOTP and alarm status from settings
      const totpData = await invoke('settings:get', 'totp_enabled')
      if (totpData === 'true' || totpData === '1') setTotpEnabled(true)

      const alarmData = await invoke('settings:get', 'alarm_enabled')
      if (alarmData === 'true' || alarmData === '1') setAlarmEnabled(true)
    } catch {}
  }

  const handleAutoLockChange = async (ms: string) => {
    setAutoLockMs(ms)
    await invoke('settings:set', 'auto_lock_ms', ms)
    addToast('Auto-lock updated', 'success')
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

  return (
    <div className="space-y-6">
      {/* Auto-lock */}
      <div>
        <label className="text-sm font-medium text-vault-text block mb-2">Auto-lock timeout</label>
        <select
          value={autoLockMs}
          onChange={(e) => handleAutoLockChange(e.target.value)}
          className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
        >
          <option value="60000">1 minute</option>
          <option value="300000">5 minutes</option>
          <option value="900000">15 minutes</option>
          <option value="1800000">30 minutes</option>
          <option value="3600000">1 hour</option>
        </select>
      </div>

      {/* Change master password */}
      <div>
        <label className="text-sm font-medium text-vault-text block mb-2">Master Password</label>
        <Button variant="secondary" onClick={() => setShowChangePassword(true)} className="w-full">
          Change Master Password
        </Button>
      </div>

      {/* TOTP 2FA */}
      <div>
        <label className="text-sm font-medium text-vault-text block mb-2">Two-Factor Authentication</label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowSetupTOTP(true)} className="flex-1">
            {totpEnabled ? 'Manage 2FA' : 'Enable 2FA'}
          </Button>
          {totpEnabled && (
            <Button variant="danger" onClick={() => setShowDisableTOTP(true)} className="flex-1">
              Disable 2FA
            </Button>
          )}
        </div>
      </div>

      {/* Duress Code */}
      <div>
        <label className="text-sm font-medium text-vault-text block mb-2">Duress Code</label>
        <p className="text-xs text-vault-text-secondary mb-2">
          A secondary password that opens an empty vault. Use it under duress to protect your real data.
        </p>
        <Button variant="secondary" onClick={() => setShowAlarmSetup(true)} className="w-full">
          {alarmEnabled ? 'Change Duress Code' : 'Set Up Duress Code'}
        </Button>
        {alarmEnabled && (
          <Button variant="danger" onClick={handleRemoveAlarm} className="w-full mt-2">
            Remove Duress Code
          </Button>
        )}
      </div>

      {/* Clipboard */}
      <div>
        <label className="text-sm font-medium text-vault-text block mb-2">Clipboard</label>
        <p className="text-xs text-vault-text-secondary mb-2">
          Clear clipboard contents immediately. Copies auto-clear after 30 seconds.
        </p>
        <Button variant="secondary" onClick={handleClearClipboard} className="w-full">
          Clear Clipboard
        </Button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {showSetupTOTP && (
        <TOTPSetupModal onClose={() => setShowSetupTOTP(false)} onStatusChange={setTotpEnabled} />
      )}
      {showAlarmSetup && (
        <AlarmSetupModal onClose={() => setShowAlarmSetup(false)} onStatusChange={setAlarmEnabled} />
      )}
      {showDisableTOTP && (
        <DisableTOTPModal onClose={() => setShowDisableTOTP(false)} onStatusChange={setTotpEnabled} />
      )}
    </div>
  )
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async () => {
    if (!oldPwd || !newPwd) {
      addToast('Fill in all fields', 'warning')
      return
    }
    if (newPwd !== confirmPwd) {
      addToast('Passwords do not match', 'warning')
      return
    }
    if (newPwd.length < 8) {
      addToast('Password must be at least 8 characters', 'warning')
      return
    }
    setLoading(true)
    try {
      const result = await invoke('vault:change-master-password', oldPwd, newPwd)
      if (result.success) {
        addToast('Master password changed', 'success')
        onClose()
      } else {
        addToast(result.error || 'Failed', 'error')
      }
    } catch {
      addToast('Failed to change password', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-vault-text">Change Master Password</h3>
        <Input
          label="Current Password"
          type="password"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
          showPasswordToggle
        />
        <Input
          label="New Password"
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          showPasswordToggle
        />
        <Input
          label="Confirm New Password"
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          showPasswordToggle
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Changing...' : 'Change'}
          </Button>
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
      setSecret(result.secret)
      setQrUrl(result.qrCodeUrl)
      setStep('verify')
    } catch {
      addToast('Failed to generate TOTP secret', 'error')
    }
  }

  const handleVerify = async (code: string): Promise<boolean> => {
    const success = await invoke('vault:verify-totp', code)
    if (success) {
      addToast('2FA enabled successfully', 'success')
      onStatusChange?.(true)
      onClose()
      return true
    }
    addToast('Invalid code', 'error')
    return false
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        {step === 'init' ? (
          <>
            <h3 className="text-lg font-semibold text-vault-text">Enable 2FA</h3>
            <p className="text-sm text-vault-text-secondary">
              Add an extra layer of security to your vault with two-factor authentication.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={handleEnable}>Enable</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-vault-text">Verify 2FA Setup</h3>
            <p className="text-sm text-vault-text-secondary">
              Scan this QR code with your authenticator app, then enter the code below.
            </p>
            {/* QR Code */}
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
    if (success) {
      addToast('2FA disabled', 'success')
      onStatusChange?.(false)
      onClose()
      return true
    }
    addToast('Invalid code', 'error')
    return false
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-vault-text">Disable 2FA</h3>
        <p className="text-sm text-vault-text-secondary">
          Enter your current 6-digit code to disable two-factor authentication.
        </p>
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
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async () => {
    if (!alarmPassword) {
      addToast('Password is required', 'warning')
      return
    }
    if (alarmPassword !== confirmPassword) {
      addToast('Passwords do not match', 'warning')
      return
    }
    if (alarmPassword.length < 4) {
      addToast('Password must be at least 4 characters', 'warning')
      return
    }
    setLoading(true)
    try {
      const result = await invoke('vault:setup-alarm', alarmPassword)
      if (result.success) {
        addToast('Duress code set up successfully', 'success')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-vault-surface border border-vault-border rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-vault-text">Set Up Duress Code</h3>
        <p className="text-sm text-vault-text-secondary">
          This password will open an empty vault. Use it when forced to reveal your password.
        </p>
        <Input
          label="Duress Password"
          type="password"
          value={alarmPassword}
          onChange={(e) => setAlarmPassword(e.target.value)}
          showPasswordToggle
        />
        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          showPasswordToggle
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Setting up...' : 'Set Up'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AppearanceTab({ theme, setTheme }: { theme: string; setTheme: (t: 'dark' | 'light') => void }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-vault-text block mb-3">Theme</label>
        <div className="flex gap-3">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                theme === t
                  ? 'border-vault-accent bg-vault-accent/10'
                  : 'border-vault-border bg-vault-surface hover:border-vault-accent/30'
              }`}
            >
              <div className={`w-12 h-8 rounded-md ${t === 'dark' ? 'bg-[#1a1a24]' : 'bg-[#f8f9fc] border border-gray-200'}`} />
              <span className="text-xs font-medium text-vault-text capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AboutTab() {
  return (
    <div className="space-y-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center mx-auto">
        <Shield size={32} className="text-vault-accent" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-vault-text">CipherVault</h3>
        <p className="text-sm text-vault-text-secondary">Password Manager</p>
        <p className="text-xs text-vault-text-secondary mt-1">Version 1.0.0</p>
      </div>
      <div className="p-4 rounded-xl bg-vault-bg border border-vault-border text-left">
        <p className="text-xs text-vault-text-secondary leading-relaxed">
          Secure password manager with AES-256-GCM encryption.
          All data is stored locally and encrypted with your master password.
          Zero-knowledge architecture — we never see your passwords.
        </p>
      </div>
    </div>
  )
}
