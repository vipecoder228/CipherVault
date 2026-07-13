import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import { useUIStore } from '../../store/uiStore'
import { invoke } from '../../lib/ipc'
import { AlertTriangle, RefreshCw, Copy, Key } from 'lucide-react'
import { calculateStrength } from '../../lib/passwordStrength'
import type { EntryType, CreateEntryPayload, PasswordOptions } from '@shared/types'

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
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [genPassword, setGenPassword] = useState('')
  const [genOptions, setGenOptions] = useState<PasswordOptions>({
    length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true,
  })
  const { createEntry } = useEntriesStore()
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (open && initialPassword) {
      setPassword(initialPassword)
    }
  }, [open, initialPassword])

  // Generate password inline
  const doGenerate = useCallback(async () => {
    const pwd = await invoke('password:generate', genOptions)
    setGenPassword(pwd)
  }, [genOptions])

  useEffect(() => {
    if (showGen) doGenerate()
  }, [showGen, doGenerate])

  // Breach check when password changes
  useEffect(() => {
    if (!password || password.length < 4) { setBreachWarning(null); return }
    const timer = setTimeout(async () => {
      try {
        const result = await invoke('password:check-breach', password)
        setBreachWarning(result.breached ? result : null)
      } catch { setBreachWarning(null) }
    }, 500)
    return () => clearTimeout(timer)
  }, [password])

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
        notes: notes.trim() || undefined,
      }

      if (entryType === 'login') {
        data.username = username.trim() || undefined
        data.password = password || undefined
        data.url = url.trim() || undefined
      } else if (entryType === 'card') {
        data.card_number = cardNumber.trim() || undefined
        data.card_holder = cardHolder.trim() || undefined
        data.card_expiry = cardExpiry.trim() || undefined
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
    setTitle(''); setUsername(''); setPassword(''); setUrl(''); setNotes('')
    setCardNumber(''); setCardHolder(''); setCardExpiry('')
    setShowGen(false); setGenPassword('')
    onClose()
  }

  const strength = genPassword ? calculateStrength(genPassword) : null

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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-vault-text-secondary">Password</label>
                <button
                  type="button"
                  onClick={() => setShowGen(!showGen)}
                  className="flex items-center gap-1 text-xs text-vault-accent hover:text-vault-accent-hover transition-colors"
                >
                  <Key size={12} />
                  {showGen ? 'Hide Generator' : 'Generate'}
                </button>
              </div>
              <input
                type="text"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text font-mono placeholder:text-vault-text-secondary/50 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors"
              />
            </div>

            {/* Inline password generator */}
            {showGen && (
              <div className="p-3 rounded-xl bg-vault-bg border border-vault-border space-y-3 animate-slide-up">
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm text-vault-accent break-all">{genPassword}</div>
                  <button onClick={doGenerate} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors" title="Regenerate">
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={async () => { await invoke('clipboard:copy', genPassword, 30000); addToast('Copied', 'success') }} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors" title="Copy">
                    <Copy size={14} />
                  </button>
                </div>
                {strength && (
                  <div className="h-1 rounded-full bg-vault-border overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }} />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-vault-text-secondary">Length: {genOptions.length}</span>
                  <input type="range" min="8" max="64" value={genOptions.length} onChange={(e) => setGenOptions({ ...genOptions, length: +e.target.value })} className="flex-1 h-1 accent-vault-accent" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setPassword(genPassword); setShowGen(false) }} className="flex-1 py-2 bg-vault-accent text-white rounded-lg text-xs font-medium hover:bg-vault-accent-hover transition-colors">
                    Use This Password
                  </button>
                </div>
              </div>
            )}

            {/* Breach warning */}
            {breachWarning && breachWarning.breached && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
                <AlertTriangle size={16} className="text-vault-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-vault-warning">Password found in data breach</p>
                  <p className="text-xs text-vault-text-secondary mt-1">
                    Seen {breachWarning.count.toLocaleString()} times. Consider using a generated password.
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
            <Input
              label="Expiry"
              placeholder="MM/YY"
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
            />
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
