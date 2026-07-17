import { useState, useEffect, useCallback, useRef } from 'react'
import { useEntriesStore } from '../../store/entriesStore'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { HistoryViewer } from './HistoryViewer'
import { EditEntryModal } from './EditEntryModal'
import { useI18n } from '../../i18n'
import {
  X, Copy, ExternalLink, Star, Trash2, Clock, Shield, Pencil,
  Eye, EyeOff
} from 'lucide-react'

export function EntryDetail() {
  const { selectedEntry: entry, selectEntry, deleteEntry, toggleFavorite } = useEntriesStore()
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()
  const [showPassword, setShowPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!entry || typeof entry !== 'object') return null

  const handleCopy = async (text: string, field: string) => {
    try {
      await invoke('clipboard:copy', text, 30000)
      setCopiedField(field)
      addToast(t('copied_to_clipboard'), 'success')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopiedField(null), 2000)
    } catch {
      addToast(t('failed_to_copy'), 'error')
    }
  }

  const handleDelete = async () => {
    if (confirm(t('delete_entry_confirm'))) {
      await deleteEntry(entry.id)
      addToast(t('entry_deleted'), 'success')
    }
  }

  return (
    <>
      <div className="h-full flex flex-col bg-vault-bg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-vault-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-vault-surface border border-vault-border flex items-center justify-center text-lg">
              {getEntryEmoji(entry.entry_type)}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-vault-text">{entry.title || entry.entry_type}</h3>
              <p className="text-xs text-vault-text-secondary">{entry.entry_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEdit(true)}
              className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors"
              title={t('edit')}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"
              title={t('history')}
            >
              <Clock size={16} />
            </button>
            <button
              onClick={() => toggleFavorite(entry.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                entry.is_favorite ? 'text-vault-warning' : 'text-vault-text-secondary hover:text-vault-warning'
              }`}
            >
              <Star size={16} fill={entry.is_favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-danger transition-colors"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => selectEntry(null)}
              className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          {entry.title && (
            <FieldRow label={t('field_title')} value={entry.title} />
          )}

          {/* Username */}
          {entry.username && (
            <FieldRow
              label={t('field_username')}
              value={entry.username}
              copied={copiedField === 'username'}
              onCopy={() => handleCopy(entry.username, 'username')}
            />
          )}

          {/* Password */}
          {entry.password && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-vault-text-secondary">{t('field_password')}</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center h-10 px-3 rounded-lg bg-vault-surface border border-vault-border">
                  <span className="flex-1 text-sm text-vault-text font-mono truncate">
                    {showPassword ? entry.password : '•'.repeat(Math.min(entry.password?.length || 0, 20))}
                  </span>
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-vault-text-secondary hover:text-vault-text transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={() => handleCopy(entry.password, 'password')}
                  className={`h-10 px-3 rounded-lg border transition-colors ${
                    copiedField === 'password'
                      ? 'bg-vault-success/10 border-vault-success/30 text-vault-success'
                      : 'bg-vault-surface border-vault-border text-vault-text-secondary hover:text-vault-text'
                  }`}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}

          {/* URL */}
          {entry.url && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-vault-text-secondary">{t('field_url')}</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 rounded-lg bg-vault-surface border border-vault-border flex items-center">
                  <span className="flex-1 text-sm text-vault-text truncate">{entry.url}</span>
                </div>
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-vault-text-secondary hover:text-vault-text transition-colors flex items-center"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          )}

          {/* TOTP */}
          {entry.totp_secret && (
            <TOTPField entryId={entry.id} />
          )}

          {/* Card fields */}
          {entry.entry_type === 'card' && (
            <>
              {entry.card_number && (
                <FieldRow
                  label={t('card_number')}
                  value={entry.card_number}
                  copied={copiedField === 'card_number'}
                  onCopy={() => handleCopy(entry.card_number, 'card_number')}
                />
              )}
              {entry.card_holder && (
                <FieldRow label={t('cardholder')} value={entry.card_holder} />
              )}
              {entry.card_expiry && (
                <FieldRow label={t('expiry')} value={entry.card_expiry} />
              )}
            </>
          )}

          {/* Identity fields */}
          {entry.entry_type === 'identity' && (
            <>
              {(entry.identity_first_name || entry.identity_last_name) && (
                <FieldRow
                  label={t('field_name')}
                  value={`${entry.identity_first_name || ''} ${entry.identity_last_name || ''}`.trim()}
                />
              )}
              {entry.identity_phone && (
                <FieldRow
                  label={t('field_phone')}
                  value={entry.identity_phone}
                  copied={copiedField === 'identity_phone'}
                  onCopy={() => handleCopy(entry.identity_phone, 'identity_phone')}
                />
              )}
              {entry.identity_email && (
                <FieldRow
                  label={t('field_email')}
                  value={entry.identity_email}
                  copied={copiedField === 'identity_email'}
                  onCopy={() => handleCopy(entry.identity_email, 'identity_email')}
                />
              )}
              {entry.identity_address && (
                <FieldRow label={t('field_address')} value={entry.identity_address} />
              )}
              {entry.identity_passport && (
                <FieldRow
                  label={t('passport_id')}
                  value={entry.identity_passport}
                  copied={copiedField === 'identity_passport'}
                  onCopy={() => handleCopy(entry.identity_passport, 'identity_passport')}
                />
              )}
              {entry.identity_birthdate && (
                <FieldRow label={t('birthdate')} value={entry.identity_birthdate} />
              )}
            </>
          )}

          {/* Notes */}
          {entry.notes && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-vault-text-secondary">{t('field_notes')}</label>
              <div className="p-3 rounded-lg bg-vault-surface border border-vault-border">
                <p className="text-sm text-vault-text whitespace-pre-wrap">{entry.notes}</p>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-vault-border space-y-2">
            <div className="flex items-center gap-2 text-xs text-vault-text-secondary">
              <Clock size={12} />
              <span>{t('created')}: {new Date(entry.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-vault-text-secondary">
              <Clock size={12} />
              <span>{t('modified')}: {new Date(entry.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      <HistoryViewer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        entryId={entry.id}
      />
      <EditEntryModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        entry={entry}
      />
    </>
  )
}

function FieldRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied?: boolean
  onCopy?: () => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-vault-text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-10 px-3 rounded-lg bg-vault-surface border border-vault-border flex items-center">
          <span className="flex-1 text-sm text-vault-text truncate">{value}</span>
        </div>
        {onCopy && (
          <button
            onClick={onCopy}
            className={`h-10 px-3 rounded-lg border transition-colors ${
              copied
                ? 'bg-vault-success/10 border-vault-success/30 text-vault-success'
                : 'bg-vault-surface border-vault-border text-vault-text-secondary hover:text-vault-text'
            }`}
          >
            <Copy size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function TOTPField({ entryId }: { entryId: number }) {
  const { t } = useI18n()
  const [code, setCode] = useState('------')
  const [timeLeft, setTimeLeft] = useState(30)

  const fetchCode = useCallback(async () => {
    try {
      const totpCode = await invoke('entries:get-totp', entryId)
      setCode(typeof totpCode === 'string' && totpCode ? totpCode : '------')
    } catch {
      setCode('------')
    }
  }, [entryId])

  useEffect(() => {
    fetchCode()
    const interval = setInterval(() => {
      fetchCode()
      setTimeLeft(30)
    }, 30000)

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 30 : prev - 1))
    }, 1000)

    return () => {
      clearInterval(interval)
      clearInterval(timer)
    }
  }, [fetchCode])

  const circumference = 2 * Math.PI * 18

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-vault-text-secondary flex items-center gap-1">
        <Shield size={12} />
        {t('two_factor_code')}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-12 px-3 rounded-lg bg-vault-surface border border-vault-border flex items-center justify-center">
          <span className="text-lg font-mono tracking-[0.3em] text-vault-accent font-bold">
            {code}
          </span>
        </div>
        <div className="relative w-10 h-10">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="var(--vault-border)" strokeWidth="2" />
            <circle
              cx="20" cy="20" r="18" fill="none"
              stroke="var(--vault-accent)"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (timeLeft / 30) * circumference}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-vault-text">
            {timeLeft}
          </span>
        </div>
      </div>
    </div>
  )
}

function getEntryEmoji(type: string): string {
  switch (type) {
    case 'login': return '🔑'
    case 'card': return '💳'
    case 'secure_note': return '📝'
    case 'identity': return '👤'
    default: return '🔐'
  }
}
