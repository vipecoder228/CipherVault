import { useState } from 'react'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { Button } from '../ui/Button'
import { Shield, Download, Copy, AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export function EmergencyAccess({ open, onClose }: Props) {
  const [step, setStep] = useState<'intro' | 'export' | 'done'>('intro')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  if (!open) return null

  const handleExport = async () => {
    if (!password) {
      addToast('Enter a recovery password', 'warning')
      return
    }
    if (password !== confirmPassword) {
      addToast('Passwords do not match', 'warning')
      return
    }
    if (password.length < 8) {
      addToast('Recovery password must be at least 8 characters', 'warning')
      return
    }

    setLoading(true)
    try {
      const result = await invoke('backup:export', password)
      if (result.success) {
        addToast('Emergency backup created', 'success')
        setStep('done')
      } else if (result.error) {
        addToast(result.error, 'error')
      }
    } catch {
      addToast('Failed to create emergency backup', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-vault-surface border border-vault-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-vault-accent" />
            <h2 className="text-lg font-semibold text-vault-text">Emergency Access</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'intro' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-vault-bg border border-vault-border">
                <AlertTriangle size={20} className="text-vault-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm text-vault-text-secondary">
                  <p className="font-medium text-vault-text mb-1">How Emergency Access Works</p>
                  <p>Create an encrypted backup file that your trusted contact can use to restore your vault in case of emergency.</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-vault-text-secondary">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vault-accent/10 text-vault-accent flex items-center justify-center text-xs font-bold">1</span>
                  <p>Create an encrypted backup with a recovery password</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vault-accent/10 text-vault-accent flex items-center justify-center text-xs font-bold">2</span>
                  <p>Share the backup file AND the recovery password with your trusted contact</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vault-accent/10 text-vault-accent flex items-center justify-center text-xs font-bold">3</span>
                  <p>They can restore your vault on their machine using CipherVault</p>
                </div>
              </div>

              <Button onClick={() => setStep('export')} className="w-full">
                Create Emergency Backup
              </Button>
            </div>
          )}

          {step === 'export' && (
            <div className="space-y-4">
              <p className="text-sm text-vault-text-secondary">
                Set a recovery password for the emergency backup. Share this password with your trusted contact — they'll need it to restore your vault.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-vault-text-secondary mb-1.5 block">Recovery Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter recovery password"
                    className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-vault-text-secondary mb-1.5 block">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm recovery password"
                    className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text focus:outline-none focus:ring-2 focus:ring-vault-accent/50"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep('intro')} className="flex-1">Back</Button>
                <Button onClick={handleExport} disabled={loading} className="flex-1">
                  {loading ? 'Creating...' : 'Create Backup'}
                </Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-vault-success/10 border border-vault-success/30 flex items-center justify-center mx-auto">
                <Shield size={32} className="text-vault-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-vault-text mb-2">Emergency Backup Created</h3>
                <p className="text-sm text-vault-text-secondary">
                  Share the backup file AND the recovery password with your trusted contact.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-vault-bg border border-vault-border text-left">
                <p className="text-xs text-vault-text-secondary">
                  <strong className="text-vault-text">Important:</strong> Your trusted contact needs both the backup file AND the recovery password to restore your vault. Store them separately for maximum security.
                </p>
              </div>
              <Button onClick={onClose} className="w-full">Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
