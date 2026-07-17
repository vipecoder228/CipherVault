import { ArrowLeft, Copy, ExternalLink, Star, Trash2, Edit2, Lock, Fingerprint } from 'lucide-react'
import { useEntriesStore } from '../../store/entriesStore'
import { useVaultStore } from '../../store/vaultStore'
import { getBiometric } from '../../services/biometricService'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { invoke } from '../../lib/ipc'
import { EditEntryModal } from '../entries/EditEntryModal'
import { useState, useEffect } from 'react'

export function MobileEntryDetail() {
  const { selectedEntry, selectEntry, toggleFavorite, deleteEntry } = useEntriesStore()
  const { verifySecureNote, isSecureNoteVerified } = useVaultStore()
  const { t } = useI18n()
  const addToast = useToastStore((s) => s.addToast)
  const [showPassword, setShowPassword] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [viewPassword, setViewPassword] = useState('')
  const [viewPasswordError, setViewPasswordError] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)

  useEffect(() => {
    getBiometric().isAvailable().then(setBiometricAvailable)
  }, [])

  if (!selectedEntry) return null

  // Secure note password verification gate
  if (selectedEntry.entry_type === 'secure_note' && !isSecureNoteVerified(selectedEntry.id)) {
    const handleVerify = async () => {
      if (!viewPassword) return
      setVerifying(true)
      setViewPasswordError(false)
      const ok = await verifySecureNote(selectedEntry.id, viewPassword)
      setVerifying(false)
      if (!ok) {
        setViewPasswordError(true)
        setViewPassword('')
      }
    }

    const handleBiometric = async () => {
      setVerifying(true)
      setViewPasswordError(false)
      const bio = getBiometric()
      const result = await bio.authenticate(
        t('secure_note_protected'),
        selectedEntry.title || 'Заметка',
        t('biometric_reason')
      )
      setVerifying(false)
      if (result.success) {
        verifySecureNote(selectedEntry.id, '__biometric__')
      } else {
        setViewPasswordError(true)
      }
    }

    return (
      <div className="fixed inset-0 bg-vault-bg z-40 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-vault-border">
          <button onClick={() => selectEntry(null as any)} className="p-2 -ml-2 text-vault-text-secondary">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-sm font-semibold text-vault-text">{t('secure_note_protected')}</h2>
          <div className="w-10" />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center mx-auto">
              <Lock size={32} className="text-vault-accent" />
            </div>
            <h3 className="text-lg font-semibold text-vault-text">{selectedEntry.title || 'Заметка'}</h3>
            <p className="text-sm text-vault-text-secondary">{t('enter_master_password_to_view')}</p>

            {/* Biometric button */}
            {biometricAvailable && (
              <button
                onClick={handleBiometric}
                disabled={verifying}
                className="w-full h-12 bg-vault-surface border border-vault-border rounded-xl font-medium hover:bg-vault-surface-hover transition-colors flex items-center justify-center gap-2"
              >
                <Fingerprint size={20} className="text-vault-accent" />
                {t('use_biometric')}
              </button>
            )}

            <div className="text-xs text-vault-text-secondary">{t('or_enter_password')}</div>

            <input
              type="password"
              placeholder={t('master_password_placeholder')}
              value={viewPassword}
              onChange={(e) => { setViewPassword(e.target.value); setViewPasswordError(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              className="w-full h-12 px-4 rounded-xl bg-vault-surface border border-vault-border text-vault-text text-center font-mono placeholder:text-vault-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent transition-colors text-lg tracking-wide"
              autoFocus
            />
            {viewPasswordError && (
              <p className="text-xs text-vault-danger">{t('invalid_password')}</p>
            )}
            <button
              onClick={handleVerify}
              disabled={verifying || !viewPassword}
              className="w-full h-12 bg-vault-accent text-white rounded-xl font-medium hover:bg-vault-accent-hover transition-colors disabled:opacity-50"
            >
              {verifying ? '...' : t('unlock')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleBack = () => {
    selectEntry(null as any)
  }

  const handleCopy = async (text: string) => {
    try {
      await invoke('clipboard:copy', text, 30000)
      addToast(t('copied_to_clipboard'), 'success')
    } catch {
      addToast(t('failed_to_copy'), 'error')
    }
  }

  const handleDelete = () => {
    if (confirm('Удалить запись?')) {
      deleteEntry(selectedEntry.id)
      selectEntry(null as any)
    }
  }

  const handleEdit = () => {
    setShowEdit(true)
  }

  const handleOpenUrl = () => {
    if (selectedEntry.url) {
      window.open(selectedEntry.url, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 bg-vault-bg z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-vault-border">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-vault-text-secondary hover:text-vault-text"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFavorite(selectedEntry.id)}
            className={`p-2 ${selectedEntry.is_favorite ? 'text-vault-warning' : 'text-vault-text-secondary'}`}
          >
            <Star size={24} fill={selectedEntry.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleEdit}
            className="p-2 text-vault-text-secondary hover:text-vault-accent"
          >
            <Edit2 size={24} />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-vault-text-secondary hover:text-vault-danger"
          >
            <Trash2 size={24} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <h1 className="text-xl font-semibold text-vault-text">
            {selectedEntry.title || 'Без названия'}
          </h1>
          {selectedEntry.url && (
            <button
              onClick={handleOpenUrl}
              className="flex items-center gap-1 text-sm text-vault-accent hover:underline mt-1"
            >
              <ExternalLink size={14} />
              {selectedEntry.url}
            </button>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {/* Username */}
          {selectedEntry.username && (
            <div className="p-3 bg-vault-surface rounded-xl border border-vault-border">
              <div className="text-xs text-vault-text-secondary mb-1">Имя пользователя</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-vault-text">
                  {selectedEntry.username || '••••••••'}
                </span>
                <button
                  onClick={() => handleCopy(selectedEntry.username || '')}
                  className="p-1 text-vault-text-secondary hover:text-vault-accent"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Password */}
          {selectedEntry.password && (
            <div className="p-3 bg-vault-surface rounded-xl border border-vault-border">
              <div className="text-xs text-vault-text-secondary mb-1">Пароль</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-vault-text font-mono">
                  {showPassword ? selectedEntry.password : '••••••••'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-vault-text-secondary hover:text-vault-accent text-xs"
                  >
                    {showPassword ? 'Скрыть' : 'Показать'}
                  </button>
                  <button
                    onClick={() => handleCopy(selectedEntry.password || '')}
                    className="p-1 text-vault-text-secondary hover:text-vault-accent"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {selectedEntry.notes && (
            <div className="p-3 bg-vault-surface rounded-xl border border-vault-border">
              <div className="text-xs text-vault-text-secondary mb-1">Заметки</div>
              <div className="text-sm text-vault-text whitespace-pre-wrap">
                {selectedEntry.notes || '••••••••'}
              </div>
            </div>
          )}

          {/* TOTP */}
          {selectedEntry.totp_secret && (
            <div className="p-3 bg-vault-surface rounded-xl border border-vault-border">
              <div className="text-xs text-vault-text-secondary mb-1">TOTP</div>
              <div className="text-sm text-vault-text font-mono">
                {selectedEntry.totp_secret || '••••••••'}
              </div>
            </div>
          )}
        </div>

        {/* Category */}
        {selectedEntry.category_id && (
          <div className="p-3 bg-vault-surface rounded-xl border border-vault-border">
            <div className="text-xs text-vault-text-secondary mb-1">Категория</div>
            <div className="text-sm text-vault-text">
              {'Категория ' + selectedEntry.category_id}
            </div>
          </div>
        )}
      </div>
      <EditEntryModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        entry={selectedEntry}
      />
    </div>
  )
}
