import { cn } from '../../lib/utils'
import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'

let openModalCount = 0

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, className, maxWidth = 'max-w-lg' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      openModalCount++
      if (openModalCount === 1) {
        document.body.style.overflow = 'hidden'
      }
    }
    return () => {
      if (open) {
        openModalCount--
        if (openModalCount === 0) {
          document.body.style.overflow = ''
        }
      }
    }
  }, [open])

  if (!open) return null

  // Mobile: full-screen layout
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-vault-surface animate-slide-up">
        {title && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-vault-border bg-vault-surface flex-shrink-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-lg font-semibold text-vault-text">{title}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    )
  }

  // Desktop: centered modal
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className={cn(
          'relative w-full mx-4 bg-vault-surface border border-vault-border rounded-2xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col',
          maxWidth,
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border flex-shrink-0">
            <h2 className="text-lg font-semibold text-vault-text">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
