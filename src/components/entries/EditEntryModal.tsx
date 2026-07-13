import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { RefreshCw, Copy, Key } from 'lucide-react'
import { calculateStrength } from '../../lib/passwordStrength'
import type { UpdateEntryPayload, DecryptedEntry, PasswordOptions } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  entry: DecryptedEntry | null
}

export function EditEntryModal({ open, onClose, entry }: Props) {
  const [title, setTitle] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [genPassword, setGenPassword] = useState('')
  const [genOptions, setGenOptions] = useState<PasswordOptions>({
    length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true,
  })
  const { updateEntry } = useEntriesStore()
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (open && entry) {
      setTitle(entry.title || '')
      setUsername(entry.username || '')
      setPassword(entry.password || '')
      setUrl(entry.url || '')
      setNotes(entry.notes || '')
      setCardNumber(entry.card_number || '')
      setCardHolder(entry.card_holder || '')
      setCardExpiry(entry.card_expiry || '')
    }
  }, [open, entry])

  const doGenerate = useCallback(async () => {
    const pwd = await invoke('password:generate', genOptions)
    setGenPassword(pwd)
  }, [genOptions])

  useEffect(() => {
    if (showGen) doGenerate()
  }, [showGen, doGenerate])

  const handleSubmit = async () => {
    if (!entry) return
    if (!title.trim()) {
      addToast('Title is required', 'warning')
      return
    }

    setLoading(true)
    try {
      const data: UpdateEntryPayload = {
        title: title.trim(),
        username: entry.entry_type === 'login' ? username.trim() : undefined,
        password: entry.entry_type === 'login' ? password : undefined,
        url: entry.entry_type === 'login' ? url.trim() : undefined,
        notes: notes.trim(),
        card_number: entry.entry_type === 'card' ? cardNumber.trim() : undefined,
        card_holder: entry.entry_type === 'card' ? cardHolder.trim() : undefined,
        card_expiry: entry.entry_type === 'card' ? cardExpiry.trim() : undefined,
      }
      await updateEntry(entry.id, data)
      addToast('Entry updated', 'success')
      onClose()
    } catch (e: any) {
      console.error('Update entry failed:', e)
      addToast(e?.message || 'Failed to update entry', 'error')
    } finally {
      setLoading(false)
    }
  }

  const strength = genPassword ? calculateStrength(genPassword) : null

  return (
    <Modal open={open} onClose={onClose} title="Edit Entry">
      <div className="space-y-4">
        <Input
          label="Title"
          placeholder="e.g. Google Account"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        {/* Login fields */}
        {entry?.entry_type === 'login' && (
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

            {showGen && (
              <div className="p-3 rounded-xl bg-vault-bg border border-vault-border space-y-3 animate-slide-up">
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm text-vault-accent break-all">{genPassword}</div>
                  <button onClick={doGenerate} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"><RefreshCw size={14} /></button>
                  <button onClick={async () => { await invoke('clipboard:copy', genPassword, 30000); addToast('Copied', 'success') }} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors"><Copy size={14} /></button>
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
                <button onClick={() => { setPassword(genPassword); setShowGen(false) }} className="w-full py-2 bg-vault-accent text-white rounded-lg text-xs font-medium hover:bg-vault-accent-hover transition-colors">
                  Use This Password
                </button>
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
        {entry?.entry_type === 'card' && (
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
