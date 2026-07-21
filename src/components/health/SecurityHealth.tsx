import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react'
import type { PasswordHealth } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

function loadHealthHistory(): Array<{ date: string; score: number }> {
  try {
    const saved = localStorage.getItem('health_history')
    if (saved) return JSON.parse(saved)
  } catch {}
  return []
}

function saveHealthHistory(score: number) {
  const history = loadHealthHistory()
  const today = new Date().toISOString().split('T')[0]
  const existing = history.findIndex(h => h.date === today)
  if (existing >= 0) {
    history[existing].score = score
  } else {
    history.push({ date: today, score })
  }
  // Keep last 30 entries
  if (history.length > 30) history.splice(0, history.length - 30)
  localStorage.setItem('health_history', JSON.stringify(history))
}

export function SecurityHealth({ open, onClose }: Props) {
  const [health, setHealth] = useState<PasswordHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ date: string; score: number }>>([])
  const addToast = useToastStore((s) => s.addToast)
  const { t } = useI18n()

  const analyze = async () => {
    setLoading(true)
    try {
      const result = await invoke('health:analyze')
      setHealth(result)
      saveHealthHistory(result.score)
      setHistory(loadHealthHistory())
    } catch {
      addToast(t('toast_health_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      analyze()
      setHistory(loadHealthHistory())
    }
  }, [open])

  if (!open) return null

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e'
    if (score >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return t('health_score_good')
    if (score >= 50) return t('health_score_fair')
    return t('health_score_weak')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-vault-surface border border-vault-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-vault-accent" />
            <h2 className="text-lg font-semibold text-vault-text">{t('health_title')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : health ? (
            <div className="space-y-6">
              {/* Score */}
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" fill="none" stroke="var(--vault-border)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="36" fill="none"
                      stroke={getScoreColor(health.score)}
                      strokeWidth="6"
                      strokeDasharray={2 * Math.PI * 36}
                      strokeDashoffset={2 * Math.PI * 36 * (1 - health.score / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold" style={{ color: getScoreColor(health.score) }}>{health.score}</span>
                    <span className="text-[10px] text-vault-text-secondary">{getScoreLabel(health.score)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-vault-text">{t('health_analyzed', { n: health.total })}</p>
                  <button onClick={analyze} className="text-xs text-vault-accent hover:underline flex items-center gap-1 mt-1">
                    <RefreshCw size={12} /> {t('health_reanalyze')}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-vault-bg border border-vault-border text-center">
                  <div className="text-lg font-bold text-vault-warning">{health.weak}</div>
                  <div className="text-[10px] text-vault-text-secondary">{t('health_weak')}</div>
                </div>
                <div className="p-3 rounded-xl bg-vault-bg border border-vault-border text-center">
                  <div className="text-lg font-bold text-vault-danger">{health.reused}</div>
                  <div className="text-[10px] text-vault-text-secondary">{t('health_reused')}</div>
                </div>
                <div className="p-3 rounded-xl bg-vault-bg border border-vault-border text-center">
                  <div className="text-lg font-bold text-vault-accent">{health.old}</div>
                  <div className="text-[10px] text-vault-text-secondary">{t('health_old')}</div>
                </div>
              </div>

              {/* Score trend */}
              {history.length > 1 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-vault-text">{t('health_trend')}</h3>
                  <div className="flex items-end gap-1 h-16">
                    {history.slice(-10).map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t transition-all"
                          style={{
                            height: `${(h.score / 100) * 100}%`,
                            backgroundColor: getScoreColor(h.score),
                          }}
                        />
                        <span className="text-[8px] text-vault-text-secondary">
                          {new Date(h.date).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Details */}
              {health.details.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-vault-text">{t('health_issues_found')}</h3>
                  {health.details.map((item) => (
                    <div key={item.entryId} className="p-3 rounded-xl bg-vault-bg border border-vault-border">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-vault-warning" />
                        <span className="text-sm font-medium text-vault-text">{item.title}</span>
                      </div>
                      <ul className="ml-5 space-y-0.5">
                        {item.issues.map((issue, i) => (
                          <li key={i} className="text-xs text-vault-text-secondary">• {t(issue as any)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {health.details.length === 0 && (
                <div className="text-center py-8 text-vault-text-secondary">
                  <Shield size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('health_all_good')}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
