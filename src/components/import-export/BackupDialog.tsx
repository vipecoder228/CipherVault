import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { Download, Upload, AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'export' | 'import'
}

export function BackupDialog({ open, onClose, mode }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async () => {
    if (!password) {
      addToast('Password is required', 'warning')
      return
    }

    if (mode === 'export' && password !== confirmPassword) {
      addToast('Passwords do not match', 'warning')
      return
    }

    if (password.length < 4) {
      addToast('Password must be at least 4 characters', 'warning')
      return
    }

    setLoading(true)
    try {
      if (mode === 'export') {
        const result = await invoke('backup:export', password)
        if (result.success) {
          addToast(`Backup saved to ${result.path}`, 'success')
          handleClose()
        } else if (result.error) {
          addToast(result.error, 'error')
        }
      } else {
        // Import — confirm first
        if (!confirm('This will REPLACE your current vault. Are you sure?')) {
          setLoading(false)
          return
        }
        const result = await invoke('backup:import', password)
        if (result.success) {
          addToast('Backup imported successfully. App will reload.', 'success')
          setTimeout(() => window.location.reload(), 1500)
        } else if (result.error) {
          addToast(result.error, 'error')
        }
      }
    } catch (e: any) {
      addToast(e?.message || 'Backup failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPassword('')
    setConfirmPassword('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === 'export' ? 'Export Encrypted Backup' : 'Import Encrypted Backup'}
    >
      <div className="space-y-4">
        {mode === 'import' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
            <AlertTriangle size={16} className="text-vault-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-vault-warning">
              This will replace your current vault with the backup data. Make sure you have a backup of your current vault first.
            </p>
          </div>
        )}

        {mode === 'export' ? (
          <p className="text-sm text-vault-text-secondary">
            Your vault will be encrypted with a separate backup password. Store this file safely — you'll need the password to restore it.
          </p>
        ) : (
          <p className="text-sm text-vault-text-secondary">
            Select a .ciphervault backup file and enter its password to restore.
          </p>
        )}

        <Input
          label="Backup Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showPasswordToggle
          autoFocus
        />

        {mode === 'export' && (
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            showPasswordToggle
          />
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {mode === 'export' ? 'Encrypting...' : 'Importing...'}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {mode === 'export' ? <Download size={16} /> : <Upload size={16} />}
                {mode === 'export' ? 'Export Backup' : 'Import Backup'}
              </span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
