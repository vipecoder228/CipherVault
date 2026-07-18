import { create } from 'zustand'
import { cn } from '../../lib/utils'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message, type = 'info', duration = 3000) => {
    // Deduplicate: don't add same message within 2 seconds
    const existing = get().toasts.find(t => t.message === message)
    if (existing) return

    const id = Math.random().toString(36).slice(2)
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))

    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id)
      }, duration)
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-vault-success" />,
  error: <AlertCircle size={16} className="text-vault-danger" />,
  warning: <AlertTriangle size={16} className="text-vault-warning" />,
  info: <Info size={16} className="text-vault-accent" />,
}

const bgColors: Record<ToastType, string> = {
  success: 'border-vault-success/30 bg-vault-success/10',
  error: 'border-vault-danger/30 bg-vault-danger/10',
  warning: 'border-vault-warning/30 bg-vault-warning/10',
  info: 'border-vault-accent/30 bg-vault-accent/10',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm animate-slide-up min-w-[280px] max-w-[400px]',
            bgColors[toast.type]
          )}
        >
          {icons[toast.type]}
          <span className="text-sm text-vault-text flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
