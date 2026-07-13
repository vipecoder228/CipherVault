import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { AlertTriangle } from 'lucide-react'
import type { EntryType, CreateEntryPayload } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  initialPassword?: string | null
}

export function CreateEntryModal({ open, onClose, initialPassword }: Props) {
  const [entryType, setEntryType] = useState<EntryType>('login')
  const [title, setTitle] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [breachWarning, setBreachWarning] = useState<{ breached: boolean; count: number } | null>(null)
  const [checkingBreach, setCheckingBreach] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const { createEntry } = useEntriesStore()
  const addToast = useToastStore((s) => s.addToast)

  // Set initial password when modal opens
  useEffect(() => {
    if (open && initialPassword) {
      setPassword(initialPassword)
    }
  }, [open, initialPassword])

  // Breach check when password changes
  const checkBreach = useCallback(async (pwd: string) => {
    if (!pwd || pwd.length < 4) {
      setBreachWarning(null)
      return
    }
    setCheckingBreach(true)
    try {
      const result = await invoke('password:check-breach', pwd)
      setBreachWarning(result.breached ? result : null)
    } catch {
      setBreachWarning(null)
    } finally {
      setCheckingBreach(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => checkBreach(password), 500)
    return () => clearTimeout(timer)
  }, [password, checkBreach])

  const handleSubmit = async () => {
    if (!title.trim()) {
      addToast('Title is required', 'warning')
      return
    }

    setLoading(true)
    try {
      const data: CreateEntryPayload = {
        entry_type: entryType,
        title: title.trim(),
        username: entryType === 'login' ? username.trim() : undefined,
        password: entryType === 'login' ? password : undefined,
        url: entryType === 'login' ? url.trim() : undefined,
        notes: notes.trim(),
        card_number: entryType === 'card' ? cardNumber.trim() : undefined,
        card_holder: entryType === 'card' ? cardHolder.trim() : undefined,
        card_expiry: entryType === 'card' ? cardExpiry.trim() : undefined,
      }
      await createEntry(data)
      addToast('Entry created successfully', 'success')
      handleClose()
    } catch (e: any) {
      console.error('Create entry failed:', e)
      addToast(e?.message || 'Failed to create entry', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTitle('')
    setUsername('')
    setPassword('')
    setUrl('')
    setNotes('')
    setCardNumber('')
    setCardHolder('')
    setCardExpiry('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Entry">
      <div className="space-y-4">
        {/* Entry type selector */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">Type</label>
          <div className="flex gap-2">
            {([
              { type: 'login' as EntryType, emoji: '🔑', label: 'Login' },
              { type: 'card' as EntryType, emoji: '💳', label: 'Card' },
              { type: 'secure_note' as EntryType, emoji: '📝', label: 'Note' },
              { type: 'identity' as EntryType, emoji: '👤', label: 'Identity' },
            ]).map(({ type, emoji, label }) => (
              <button
                key={type}
                onClick={() => setEntryType(type)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                  entryType === type
                    ? 'bg-vault-accent/10 border-vault-accent/30 text-vault-accent'
                    : 'bg-vault-surface border-vault-border text-vault-text-secondary hover:text-vault-text'
                }`}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Title"
          placeholder="e.g. Google Account"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        {/* Login fields */}
        {entryType === 'login' && (
          <>
            <Input
              label="Username / Email"
              placeholder="user@example.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              label="Password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPasswordToggle
            />
            {/* Breach warning */}
            {breachWarning && breachWarning.breached && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
                <AlertTriangle size={16} className="text-vault-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-vault-warning">Password found in data breach</p>
                  <p className="text-xs text-vault-text-secondary mt-1">
                    This password has been seen {breachWarning.count.toLocaleString()} times in data breaches.
                    Consider using a different password.
                  </p>
                </div>
              </div>
            )}
            <Input
              label="URL"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </>
        )}

        {/* Card fields */}
        {entryType === 'card' && (
          <>
            <Input
              label="Card Number"
              placeholder="4242 4242 4242 4242"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
            />
            <Input
              label="Cardholder Name"
              placeholder="JOHN DOE"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Expiry"
                placeholder="MM/YY"
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-1.5 block">Notes</label>
          <textarea
            placeholder="Additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-20 px-3 py-2 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create Entry'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
