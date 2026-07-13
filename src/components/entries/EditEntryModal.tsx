import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import type { EntryType, UpdateEntryPayload, DecryptedEntry } from '@shared/types'

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
    } catch {
      addToast('Failed to update entry', 'error')
    } finally {
      setLoading(false)
    }
  }

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
            <Input
              label="Password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPasswordToggle
            />
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
