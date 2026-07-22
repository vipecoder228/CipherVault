import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useEntriesStore } from '../../store/entriesStore'
import { useToastStore } from '../ui/Toast'
import { invoke } from '../../lib/ipc'
import { useI18n } from '../../i18n'
import { AlertTriangle, RefreshCw, Copy, Key, Shield, Plus, Trash2 } from 'lucide-react'
import { calculateStrength, estimateCrackTime } from '../../lib/passwordStrength'
import type { EntryType, CreateEntryPayload, PasswordOptions, CustomField } from '@shared/types'

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
  const [totpSecret, setTotpSecret] = useState('')
  const [breachWarning, setBreachWarning] = useState<{ breached: boolean; count: number } | null>(null)
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
  const [passkeyRpName, setPasskeyRpName] = useState('')
  const [passkeyRpId, setPasskeyRpId] = useState('')
  const [passkeyUserName, setPasskeyUserName] = useState('')
  const [creatingPasskey, setCreatingPasskey] = useState(false)
  const { createEntry } = useEntriesStore()
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  useEffect(() => {
    if (open && initialPassword) {
      setPassword(initialPassword)
    }
  }, [open, initialPassword])

  // Auto-suggest URL from title
  useEffect(() => {
    if (entryType !== 'login' || !title || url) return
    const titleLower = title.toLowerCase().trim()
    const urlMap: Record<string, string> = {
      'google': 'https://accounts.google.com',
      'gmail': 'https://mail.google.com',
      'youtube': 'https://youtube.com',
      'facebook': 'https://facebook.com',
      'instagram': 'https://instagram.com',
      'twitter': 'https://twitter.com',
      'x': 'https://x.com',
      'github': 'https://github.com',
      'gitlab': 'https://gitlab.com',
      'discord': 'https://discord.com',
      'telegram': 'https://telegram.org',
      'whatsapp': 'https://web.whatsapp.com',
      'spotify': 'https://spotify.com',
      'netflix': 'https://netflix.com',
      'amazon': 'https://amazon.com',
      'apple': 'https://apple.com',
      'microsoft': 'https://microsoft.com',
      'office': 'https://office.com',
      'outlook': 'https://outlook.live.com',
      'linkedin': 'https://linkedin.com',
      'reddit': 'https://reddit.com',
      'tiktok': 'https://tiktok.com',
      'pinterest': 'https://pinterest.com',
      'twitch': 'https://twitch.tv',
      'dropbox': 'https://dropbox.com',
      'slack': 'https://slack.com',
      'notion': 'https://notion.so',
      'figma': 'https://figma.com',
      'canva': 'https://canva.com',
      'steam': 'https://store.steampowered.com',
      'epic': 'https://epicgames.com',
      'playstation': 'https://playstation.com',
      'xbox': 'https://xbox.com',
      'nintendo': 'https://nintendo.com',
      'uber': 'https://uber.com',
      'lyft': 'https://lyft.com',
      'airbnb': 'https://airbnb.com',
      'booking': 'https://booking.com',
      'visa': 'https://visa.com',
      'mastercard': 'https://mastercard.com',
      'paypal': 'https://paypal.com',
      'stripe': 'https://stripe.com',
      'binance': 'https://binance.com',
      'coinbase': 'https://coinbase.com',
    }
    for (const [key, url] of Object.entries(urlMap)) {
      if (titleLower.includes(key)) {
        setUrl(url)
        break
      }
    }
  }, [title, entryType, url])

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
        // Send Telegram notification if breach detected
        if (result.breached && title) {
          try {
            await invoke('email:send-breach-notification', title, result.count)
          } catch {}
        }
      } catch { setBreachWarning(null) }
    }, 500)
    return () => clearTimeout(timer)
  }, [password, title])

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
    if (!title.trim()) {
      addToast(t('title_required'), 'warning')
      return
    }

    setLoading(true)
    try {
      const validCustomFields = customFields.filter(f => f.label.trim())
      const data: CreateEntryPayload = {
        entry_type: entryType,
        title: title.trim(),
        notes: notes.trim() || undefined,
        totp_secret: totpSecret.trim() || undefined,
        custom_fields: validCustomFields.length > 0 ? validCustomFields : undefined,
      }

      if (entryType === 'login') {
        data.username = username.trim() || undefined
        data.password = password || undefined
        data.url = url.trim() || undefined
      } else if (entryType === 'card') {
        data.card_number = cardNumber.trim() || undefined
        data.card_holder = cardHolder.trim() || undefined
        data.card_expiry = cardExpiry.trim() || undefined
      } else if (entryType === 'identity') {
        data.identity_first_name = identityFirstName.trim() || undefined
        data.identity_last_name = identityLastName.trim() || undefined
        data.identity_phone = identityPhone.trim() || undefined
        data.identity_email = identityEmail.trim() || undefined
        data.identity_address = identityAddress.trim() || undefined
        data.identity_passport = identityPassport.trim() || undefined
        data.identity_birthdate = identityBirthdate.trim() || undefined
      } else if (entryType === 'passkey') {
        // Passkey creation requires WebAuthn
        if (!passkeyRpName.trim() || !passkeyRpId.trim()) {
          addToast('Relying Party name and ID are required', 'warning')
          setLoading(false)
          return
        }

        setCreatingPasskey(true)
        try {
          const { getPasskey } = await import('../../services/passkeyService')
          const passkey = await getPasskey().createCredential({
            rpName: passkeyRpName.trim(),
            rpId: passkeyRpId.trim(),
            userName: passkeyUserName.trim() || title.trim(),
            userDisplayName: title.trim(),
            challenge: crypto.getRandomValues(new Uint8Array(32)),
          })

          if (!passkey) {
            addToast('Passkey creation cancelled or failed', 'error')
            setLoading(false)
            setCreatingPasskey(false)
            return
          }

          data.passkey_id = passkey.id
          data.passkey_public_key = passkey.publicKey
          data.passkey_rp_name = passkey.rpName
          data.passkey_rp_id = passkey.rpId
          data.passkey_counter = passkey.counter
        } catch (e: any) {
          console.error('Passkey creation failed:', e)
          addToast(e?.message || 'Failed to create passkey', 'error')
          setLoading(false)
          setCreatingPasskey(false)
          return
        } finally {
          setCreatingPasskey(false)
        }
      }

      await createEntry(data)
      addToast(t('entry_created'), 'success')
      handleClose()
    } catch (e: any) {
      console.error('Create entry failed:', e)
      addToast(e?.message || t('failed_to_create_entry'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTitle(''); setUsername(''); setPassword(''); setUrl(''); setNotes('')
    setTotpSecret('')
    setCardNumber(''); setCardHolder(''); setCardExpiry('')
    setIdentityFirstName(''); setIdentityLastName(''); setIdentityPhone('')
    setIdentityEmail(''); setIdentityAddress(''); setIdentityPassport(''); setIdentityBirthdate('')
    setPasskeyRpName(''); setPasskeyRpId(''); setPasskeyUserName('')
    setShowGen(false); setGenPassword('')
    onClose()
  }

  const strength = genPassword ? calculateStrength(genPassword) : null

  const templates: Record<string, { title: string; url: string; username?: string }> = {
    email: { title: 'Email', url: 'https://mail.google.com', username: 'user@gmail.com' },
    social: { title: 'Social Media', url: 'https://facebook.com' },
    banking: { title: 'Bank Account', url: 'https://bank.com' },
    shopping: { title: 'Shopping', url: 'https://amazon.com' },
    work: { title: 'Work Account', url: 'https://slack.com' },
    gaming: { title: 'Gaming', url: 'https://store.steampowered.com' },
  }

  const applyTemplate = (template: typeof templates.email) => {
    setTitle(template.title)
    setUrl(template.url)
    if (template.username) setUsername(template.username)
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('new_entry')}>
      <div className="space-y-4">
        {/* Quick templates */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">{t('quick_templates')}</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(templates).map(([key, template]) => (
              <button
                key={key}
                onClick={() => applyTemplate(template)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-vault-bg border border-vault-border text-vault-text-secondary hover:text-vault-text hover:border-vault-accent/30 transition-colors"
              >
                {template.title}
              </button>
            ))}
          </div>
        </div>

        {/* Entry type selector */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">{t('type')}</label>
          <div className="flex gap-2">
            {([
              { type: 'login' as EntryType, emoji: '🔑', label: t('type_login') },
              { type: 'card' as EntryType, emoji: '💳', label: t('type_card') },
              { type: 'secure_note' as EntryType, emoji: '📝', label: t('type_note') },
              { type: 'identity' as EntryType, emoji: '👤', label: t('type_identity') },
              { type: 'passkey' as EntryType, emoji: '🔐', label: 'Passkey' },
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
          label={t('field_title')}
          placeholder={t('title_placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        {/* Login fields */}
        {entryType === 'login' && (
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

            {/* Inline password generator */}
            {showGen && (
              <div className="p-3 rounded-xl bg-vault-bg border border-vault-border space-y-3 animate-slide-up">
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm text-vault-accent break-all">{genPassword}</div>
                  <button onClick={doGenerate} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors" title={t('regenerate')}>
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={async () => { await invoke('clipboard:copy', genPassword, 30000); addToast(t('copied'), 'success') }} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors" title={t('copy')}>
                    <Copy size={14} />
                  </button>
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
                <div className="flex gap-2">
                  <button onClick={() => { setPassword(genPassword); setShowGen(false) }} className="flex-1 py-2 bg-vault-accent text-white rounded-lg text-xs font-medium hover:bg-vault-accent-hover transition-colors">
                    {t('use_this_password')}
                  </button>
                </div>
              </div>
            )}

            {/* Breach warning */}
            {breachWarning && breachWarning.breached && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-vault-warning/10 border border-vault-warning/30">
                <AlertTriangle size={16} className="text-vault-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-vault-warning">{t('password_breach_warning')}</p>
                  <p className="text-xs text-vault-text-secondary mt-1">
                    {t('password_breach_count', {n: breachWarning.count})}
                  </p>
                </div>
              </div>
            )}

            {/* Weak password warning */}
            {isWeakPassword && !breachWarning?.breached && (
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
        {entryType === 'card' && (
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
        {entryType === 'identity' && (
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

        {/* Passkey fields */}
        {entryType === 'passkey' && (
          <>
            <Input
              label="Relying Party Name"
              placeholder="e.g. Google, GitHub"
              value={passkeyRpName}
              onChange={(e) => setPasskeyRpName(e.target.value)}
            />
            <Input
              label="Relying Party ID"
              placeholder="e.g. google.com, github.com"
              value={passkeyRpId}
              onChange={(e) => setPasskeyRpId(e.target.value)}
            />
            <Input
              label="Username"
              placeholder="e.g. user@example.com"
              value={passkeyUserName}
              onChange={(e) => setPasskeyUserName(e.target.value)}
            />
            <div className="p-3 rounded-lg bg-vault-accent/5 border border-vault-accent/20">
              <p className="text-xs text-vault-text-secondary">
                Passkey will be created using your device's biometric or security key.
                The private key never leaves your device.
              </p>
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
          <Button variant="secondary" onClick={handleClose}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? t('creating') : t('create_entry')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
