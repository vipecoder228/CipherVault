import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { invoke } from '../../lib/ipc'
import { useI18n } from '../../i18n'
import type { EntryHistoryItem } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  entryId: number
}

interface DecryptedHistoryItem extends EntryHistoryItem {
  decrypted: Record<string, string> | null
}

export function HistoryViewer({ open, onClose, entryId }: Props) {
  const { t } = useI18n()
  const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    create: { label: t('history_created'), color: 'text-vault-success' },
    update: { label: t('history_updated'), color: 'text-vault-accent' },
    delete: { label: t('history_deleted'), color: 'text-vault-danger' },
  }
  const [history, setHistory] = useState<DecryptedHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    if (open && entryId) {
      loadHistory()
    }
  }, [open, entryId])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const data = await invoke('entries:get-decrypted-history', entryId)
      setHistory(data)
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (mins < 1) return t('just_now')
    if (mins < 60) return t('minutes_ago', { n: mins })
    if (hours < 24) return t('hours_ago', { n: hours })
    if (days < 7) return t('days_ago', { n: days })
    return date.toLocaleDateString()
  }

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('change_history')} maxWidth="max-w-lg">
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-vault-text-secondary text-sm">
            {t('no_history')}
          </div>
        ) : (
          history.map((item) => {
            const typeInfo = TYPE_LABELS[item.change_type] || TYPE_LABELS.update
            const isExpanded = expandedId === item.id
            const hasData = item.decrypted && Object.keys(item.decrypted).length > 0

            return (
              <div
                key={item.id}
                className={`rounded-xl border transition-colors ${
                  isExpanded ? 'bg-vault-surface border-vault-accent/30' : 'bg-vault-bg border-vault-border'
                }`}
              >
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => hasData && toggleExpand(item.id)}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    item.change_type === 'create' ? 'bg-vault-success' :
                    item.change_type === 'delete' ? 'bg-vault-danger' :
                    'bg-vault-accent'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className="text-xs text-vault-text-secondary ml-2">
                      {formatDate(item.changed_at)}
                    </span>
                  </div>
                  {hasData && (
                    <span className="text-xs text-vault-text-secondary">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                </div>

                {/* Expanded content - decrypted snapshot */}
                {isExpanded && item.decrypted && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-vault-border">
                    {Object.entries(item.decrypted).map(([key, value]) => (
                      value && (
                        <div key={key} className="flex items-start gap-2 text-xs">
                          <span className="text-vault-text-secondary font-medium min-w-[80px] capitalize">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <span className="text-vault-text break-all">
                            {key === 'password' ? '••••••••' : String(value)}
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
