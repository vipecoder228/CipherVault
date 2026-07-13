import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { Shield, AlertTriangle, Copy, RefreshCw } from 'lucide-react'
import type { PasswordHealth, PasswordHealthItem } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function SecurityHealth({ open, onClose }: Props) {
  const [health, setHealth] = useState<PasswordHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const analyze = async () => {
    setLoading(true)
    try {
      const result = await invoke('health:analyze')
      setHealth(result)
    } catch {
      addToast('Failed to analyze passwords', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) analyze()
  }, [open])

  if (!open) return null

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e'
    if (score >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Good'
    if (score >= 50) return 'Fair'
    return 'Weak'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-vault-surface border border-vault-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-vault-accent" />
            <h2 className="text-lg font-semibold text-vault-text">Security Health</h2>
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
                  <p className="text-sm text-vault-text">{health.total} passwords analyzed</p>
                  <button onClick={analyze} className="text-xs text-vault-accent hover:underline flex items-center gap-1 mt-1">
                    <RefreshCw size={12} /> Re-analyze
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-vault-bg border border-vault-border text-center">
                  <div className="text-lg font-bold text-vault-warning">{health.weak}</div>
                  <div className="text-[10px] text-vault-text-secondary">Weak</div>
                </div>
                <div className="p-3 rounded-xl bg-vault-bg border border-vault-border text-center">
                  <div className="text-lg font-bold text-vault-danger">{health.reused}</div>
                  <div className="text-[10px] text-vault-text-secondary">Reused</div>
                </div>
                <div className="p-3 rounded-xl bg-vault-bg border border-vault-border text-center">
                  <div className="text-lg font-bold text-vault-accent">{health.old}</div>
                  <div className="text-[10px] text-vault-text-secondary">Old</div>
                </div>
              </div>

              {/* Details */}
              {health.details.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-vault-text">Issues Found</h3>
                  {health.details.map((item) => (
                    <div key={item.entryId} className="p-3 rounded-xl bg-vault-bg border border-vault-border">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-vault-warning" />
                        <span className="text-sm font-medium text-vault-text">{item.title}</span>
                      </div>
                      <ul className="ml-5 space-y-0.5">
                        {item.issues.map((issue, i) => (
                          <li key={i} className="text-xs text-vault-text-secondary">• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {health.details.length === 0 && (
                <div className="text-center py-8 text-vault-text-secondary">
                  <Shield size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">All passwords look good!</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
