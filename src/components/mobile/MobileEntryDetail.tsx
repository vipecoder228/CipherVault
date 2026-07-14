import { ArrowLeft, Copy, ExternalLink, Star, Trash2, Edit2 } from 'lucide-react'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { EditEntryModal } from '../entries/EditEntryModal'
import { useState } from 'react'

export function MobileEntryDetail() {
  const { selectedEntry, selectEntry, toggleFavorite, deleteEntry } = useEntriesStore()
  const { setShowPasswordGenerator } = useUIStore()
  const [showPassword, setShowPassword] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  if (!selectedEntry) return null

  const handleBack = () => {
    selectEntry(null as any)
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    // TODO: Show toast
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
