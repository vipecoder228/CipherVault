import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import { invoke, copyWithTtl } from '../../lib/ipc'
import { useI18n } from '../../i18n'
import { RefreshCw, Copy, Key, Shield, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { calculateStrength, estimateCrackTime } from '../../lib/passwordStrength'
import type { UpdateEntryPayload, DecryptedEntry, PasswordOptions, CustomField } from '@shared/types'

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
  const [totpSecret, setTotpSecret] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [identityFirstName, setIdentityFirstName] = useState('')
  const [identityLastName, setIdentityLastName] = useState('')
  const [identityPhone, setIdentityPhone] = useState('')
  const [identityEmail, setIdentityEmail] = useState('')
  const [identityAddress, setIdentityAddress] = useState('')
  const [identityPassport, setIdentityPassport] = useState('')
  const [identityBirthdate, setIdentityBirthdate] = useState('')
  const [loading, setLoading] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [genPassword, setGenPassword] = useState('')
  const [genOptions, setGenOptions] = useState<PasswordOptions>({
    length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true,
  })
  const [duplicateWarning, setDuplicateWarning] = useState<{ count: number; titles: string[] } | null>(null)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const { updateEntry } = useEntriesStore()
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  useEffect(() => {
    if (open && entry) {
      setTitle(entry.title || '')
      setUsername(entry.username || '')
      setPassword(entry.password || '')
      setUrl(entry.url || '')
      setNotes(entry.notes || '')
      setTotpSecret(entry.totp_secret || '')
      setCardNumber(entry.card_number || '')
      setCardHolder(entry.card_holder || '')
      setCardExpiry(entry.card_expiry || '')
      setIdentityFirstName(entry.identity_first_name || '')
      setIdentityLastName(entry.identity_last_name || '')
      setIdentityPhone(entry.identity_phone || '')
      setIdentityEmail(entry.identity_email || '')
      setIdentityAddress(entry.identity_address || '')
      setIdentityPassport(entry.identity_passport || '')
      setIdentityBirthdate(entry.identity_birthdate || '')
      setCustomFields(entry.custom_fields || [])
    }
  }, [open, entry])

  const doGenerate = useCallback(async () => {
    const pwd = await invoke('password:generate', genOptions)
    setGenPassword(pwd)
  }, [genOptions])

  useEffect(() => {
    if (showGen) doGenerate()
  }, [showGen, doGenerate])

  // Duplicate password check
  useEffect(() => {
    if (!password || password.length < 4) { setDuplicateWarning(null); return }
    const timer = setTimeout(async () => {
      try {
        const result = await invoke('password:check-duplicate', password)
        setDuplicateWarning(result.duplicated ? result : null)
      } catch { setDuplicateWarning(null) }
    }, 500)
    return () => clearTimeout(timer)
  }, [password])

  const passwordStrength = password ? calculateStrength(password) : null
  const isWeakPassword = passwordStrength && passwordStrength.score <= 2

  const handleReplaceWithStrong = async () => {
    const strongPwd = await invoke('password:generate', { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true })
    setPassword(strongPwd)
  }

  const addCustomField = () => {
    setCustomFields([...customFields, { id: Date.now().toString(), label: '', value: '', type: 'text' }])
  }

  const updateCustomField = (id: string, updates: Partial<CustomField>) => {
    setCustomFields(customFields.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeCustomField = (id: string) => {
    setCustomFields(customFields.filter(f => f.id !== id))
  }

  const handleSubmit = async () => {
    if (!entry) return
    if (!title.trim()) {
      addToast(t('title_required'), 'warning')
      return
    }

    setLoading(true)
    try {
      const validCustomFields = customFields.filter(f => f.label.trim())
      const data: UpdateEntryPayload = {
        title: title.trim(),
        username: entry.entry_type === 'login' ? username.trim() : undefined,
        password: entry.entry_type === 'login' ? password : undefined,
        url: entry.entry_type === 'login' ? url.trim() : undefined,
        notes: notes.trim(),
        totp_secret: totpSecret.trim() || undefined,
        card_number: entry.entry_type === 'card' ? cardNumber.trim() : undefined,
        card_holder: entry.entry_type === 'card' ? cardHolder.trim() : undefined,
        card_expiry: entry.entry_type === 'card' ? cardExpiry.trim() : undefined,
        identity_first_name: entry.entry_type === 'identity' ? identityFirstName.trim() : undefined,
        identity_last_name: entry.entry_type === 'identity' ? identityLastName.trim() : undefined,
        identity_phone: entry.entry_type === 'identity' ? identityPhone.trim() : undefined,
        identity_email: entry.entry_type === 'identity' ? identityEmail.trim() : undefined,
        identity_address: entry.entry_type === 'identity' ? identityAddress.trim() : undefined,
        identity_passport: entry.entry_type === 'identity' ? identityPassport.trim() : undefined,
        identity_birthdate: entry.entry_type === 'identity' ? identityBirthdate.trim() : undefined,
        custom_fields: validCustomFields.length > 0 ? validCustomFields : [],
      }
      await updateEntry(entry.id, data)
      addToast(t('entry_updated'), 'success')
      onClose()
    } catch (e: any) {
      console.error('Update entry failed:', e)
      addToast(e?.message || t('failed_to_update_entry'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const strength = genPassword ? calculateStrength(genPassword) : null

  return (
    <Modal open={open} onClose={onClose} title={t('edit_entry')}>
      <div className="space-y-4">
        <Input
          label={t('field_title')}
          placeholder={t('title_placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        {/* Login fields */}
        {entry?.entry_type === 'login' && (
          <>
            <Input
              label={t('username_email')}
              placeholder={t('email_placeholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-vault-text-secondary">{t('field_password')}</label>
                <button
                  type="button"
                  onClick={() => setShowGen(!showGen)}
                  className="flex items-center gap-1 text-xs text-vault-accent hover:text-vault-accent-hover transition-colors"
                >
                  <Key size={12} />
                  {showGen ? t('hide_generator') : t('generate')}
                </button>
              </div>
              <input
                type="password"
                placeholder={t('enter_password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text font-mono placeholder:text-vault-text-secondary/50 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors"
              />
              {password && passwordStrength && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-vault-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${(passwordStrength.score / 4) * 100}%`,
                          backgroundColor: passwordStrength.color,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-vault-text-secondary">
                    {t('crack_time')}: {estimateCrackTime(password)}
                  </p>
                </div>
              )}
            </div>

            {showGen && (
              <div className="p-3 rounded-xl bg-vault-bg border border-vault-border space-y-3 animate-slide-up">
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm text-vault-accent break-all">{genPassword}</div>
                  <button onClick={doGenerate} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors" title={t('regenerate')}><RefreshCw size={14} /></button>
                  <button onClick={async () => { await copyWithTtl(genPassword); addToast(t('copied'), 'success') }} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors" title={t('copy')}><Copy size={14} /></button>
                </div>
                {strength && (
                  <div className="h-1 rounded-full bg-vault-border overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }} />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-vault-text-secondary">{t('length_label')}: {genOptions.length}</span>
                  <input type="range" min="8" max="64" value={genOptions.length} onChange={(e) => setGenOptions({ ...genOptions, length: +e.target.value })} className="flex-1 h-1 accent-vault-accent" />
                </div>
                <button onClick={() => { setPassword(genPassword); setShowGen(false) }} className="w-full py-2 bg-vault-accent text-white rounded-lg text-xs font-medium hover:bg-vault-accent-hover transition-colors">
                  {t('use_this_password')}
                </button>
              </div>
            )}

            {/* Weak password warning */}
            {isWeakPassword && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-500">{t('weak_password_warning')}</p>
                  <button
                    type="button"
                    onClick={handleReplaceWithStrong}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-vault-accent hover:text-vault-accent-hover transition-colors"
                  >
                    <RefreshCw size={12} />
                    {t('replace_with_strong')}
                  </button>
                </div>
              </div>
            )}

            {/* Duplicate password warning */}
            {duplicateWarning && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-500">{t('duplicate_password_warning')}</p>
                  <p className="text-xs text-vault-text-secondary mt-1">
                    {t('duplicate_password_count', { n: duplicateWarning.count, titles: duplicateWarning.titles.slice(0, 3).join(', ') })}
                  </p>
                </div>
              </div>
            )}

            <Input
              label={t('field_url')}
              placeholder={t('field_url')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            {/* 2FA Secret */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-vault-text-secondary flex items-center gap-1">
                  <Shield size={12} />
                  {t('totp_secret')}
                </label>
              </div>
              <input
                type="text"
                placeholder={t('totp_secret_placeholder')}
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text font-mono placeholder:text-vault-text-secondary/50 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors"
              />
              <p className="text-[10px] text-vault-text-secondary">
                {t('totp_secret_hint')}
              </p>
            </div>
          </>
        )}

        {/* Card fields */}
        {entry?.entry_type === 'card' && (
          <>
            <Input
              label={t('card_number')}
              placeholder={t('card_number_placeholder')}
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
            />
            <Input
              label={t('cardholder_name')}
              placeholder={t('cardholder_name')}
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
            />
            <Input
              label={t('expiry')}
              placeholder={t('expiry')}
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
            />
          </>
        )}

        {/* Identity fields */}
        {entry?.entry_type === 'identity' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('first_name')}
                placeholder={t('first_name')}
                value={identityFirstName}
                onChange={(e) => setIdentityFirstName(e.target.value)}
              />
              <Input
                label={t('last_name')}
                placeholder={t('last_name')}
                value={identityLastName}
                onChange={(e) => setIdentityLastName(e.target.value)}
              />
            </div>
            <Input
              label={t('field_phone')}
              placeholder={t('phone_placeholder')}
              value={identityPhone}
              onChange={(e) => setIdentityPhone(e.target.value)}
            />
            <Input
              label={t('field_email')}
              placeholder={t('email_placeholder')}
              value={identityEmail}
              onChange={(e) => setIdentityEmail(e.target.value)}
            />
            <Input
              label={t('field_address')}
              placeholder={t('address_placeholder')}
              value={identityAddress}
              onChange={(e) => setIdentityAddress(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('passport_id')}
                placeholder={t('passport_placeholder')}
                value={identityPassport}
                onChange={(e) => setIdentityPassport(e.target.value)}
              />
              <Input
                label={t('birthdate')}
                placeholder={t('birthdate_placeholder')}
                value={identityBirthdate}
                onChange={(e) => setIdentityBirthdate(e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-1.5 block">{t('field_notes')}</label>
          <textarea
            placeholder={t('notes_placeholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-20 px-3 py-2 rounded-lg bg-vault-surface border border-vault-border text-sm text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors resize-none"
          />
        </div>

        {/* Custom Fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-vault-text-secondary">{t('custom_fields')}</label>
            <button
              type="button"
              onClick={addCustomField}
              className="flex items-center gap-1 text-xs text-vault-accent hover:text-vault-accent-hover transition-colors"
            >
              <Plus size={12} />
              {t('add_field')}
            </button>
          </div>
          {customFields.map((field) => (
            <div key={field.id} className="flex items-center gap-2 animate-slide-up">
              <input
                type="text"
                placeholder={t('field_label')}
                value={field.label}
                onChange={(e) => updateCustomField(field.id, { label: e.target.value })}
                className="flex-1 h-9 px-2 rounded-lg bg-vault-surface border border-vault-border text-xs text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-vault-accent"
              />
              <select
                value={field.type}
                onChange={(e) => updateCustomField(field.id, { type: e.target.value as CustomField['type'] })}
                className="h-9 px-2 rounded-lg bg-vault-surface border border-vault-border text-xs text-vault-text focus:outline-none focus:ring-1 focus:ring-vault-accent"
              >
                <option value="text">Text</option>
                <option value="password">Password</option>
                <option value="url">URL</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </select>
              <input
                type={field.type === 'password' ? 'password' : 'text'}
                placeholder={t('field_value')}
                value={field.value}
                onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                className="flex-1 h-9 px-2 rounded-lg bg-vault-surface border border-vault-border text-xs text-vault-text placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-vault-accent"
              />
              <button
                type="button"
                onClick={() => removeCustomField(field.id)}
                className="p-1.5 text-vault-text-secondary hover:text-vault-danger transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? t('saving') : t('save_changes')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
