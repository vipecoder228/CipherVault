import { useState } from 'react'
import { useVaultStore } from '../../store/vaultStore'
import { VerificationScreen } from './VerificationScreen'
import { Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react'

export function UnlockScreen() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [alarmPassword, setAlarmPassword] = useState('')
  const [showAlarmPassword, setShowAlarmPassword] = useState(false)
  const [showAlarmField, setShowAlarmField] = useState(false)
  const { unlock, setup, initialized, loading, error, clearError, requiresTotp, pendingPassword, resetTotpState } = useVaultStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return

    let success: boolean
    if (initialized) {
      success = await unlock(password)
    } else {
      success = await setup(password, alarmPassword || undefined)
    }

    if (!success && !useVaultStore.getState().requiresTotp) {
      setPassword('')
    }
  }

  const handleTotpVerify = async (code: string): Promise<boolean> => {
    if (!pendingPassword) return false
    const success = await unlock(pendingPassword, code)
    return success
  }

  const handleTotpCancel = () => {
    resetTotpState()
    setPassword('')
  }

  // Show TOTP verification screen
  if (requiresTotp) {
    return (
      <VerificationScreen
        title="Two-Factor Authentication"
        subtitle="Enter the 6-digit code from your authenticator app"
        onVerify={handleTotpVerify}
        onCancel={handleTotpCancel}
      />
    )
  }

  // Password entry screen
  return (
    <div className="h-screen flex items-center justify-center bg-vault-bg">
      <div className="w-full max-w-md mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center">
              <Shield size={32} className="text-vault-accent" />
            </div>
            <div className="absolute inset-0 w-16 h-16 rounded-2xl bg-vault-accent/20 blur-xl" />
          </div>
          <h1 className="text-2xl font-bold text-vault-text mb-1">CipherVault</h1>
          <p className="text-sm text-vault-text-secondary">
            {initialized ? 'Enter your master password to unlock' : 'Create a master password to get started'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Master Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError() }}
              autoFocus
              className="w-full h-12 px-4 pr-12 rounded-xl bg-vault-surface border border-vault-border text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors text-center text-lg tracking-wide"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Alarm password field (setup only) */}
          {!initialized && (
            <>
              {!showAlarmField ? (
                <button
                  type="button"
                  onClick={() => setShowAlarmField(true)}
                  className="w-full text-xs text-vault-text-secondary hover:text-vault-accent transition-colors flex items-center justify-center gap-1"
                >
                  <AlertTriangle size={12} />
                  Add duress code (optional)
                </button>
              ) : (
                <div className="space-y-2 animate-slide-up">
                  <div className="relative">
                    <input
                      type={showAlarmPassword ? 'text' : 'password'}
                      placeholder="Duress / Alarm Password"
                      value={alarmPassword}
                      onChange={(e) => setAlarmPassword(e.target.value)}
                      className="w-full h-10 px-4 pr-10 rounded-lg bg-vault-surface border border-vault-warning/30 text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-vault-warning/50 focus:border-vault-warning transition-colors text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAlarmPassword(!showAlarmPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-vault-text-secondary hover:text-vault-text transition-colors"
                    >
                      {showAlarmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-vault-warning leading-relaxed">
                    This password opens an empty vault. Use it in emergencies to protect your real data.
                  </p>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-vault-danger/10 border border-vault-danger/30 text-sm text-vault-danger text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-12 bg-vault-accent text-white rounded-xl font-medium hover:bg-vault-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {initialized ? 'Unlocking...' : 'Setting up...'}
              </div>
            ) : (
              initialized ? 'Continue' : 'Create Vault'
            )}
          </button>
        </form>

        {/* First time hint */}
        {!initialized && (
          <p className="mt-4 text-center text-xs text-vault-text-secondary">
            This will be your master password. Choose something strong and memorable.
            <br />
            It cannot be recovered if lost.
          </p>
        )}
      </div>
    </div>
  )
}
