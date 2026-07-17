import { Home, Plus, Search, MoreVertical, Lock, Settings } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useEntriesStore } from '../../store/entriesStore'
import { useVaultStore } from '../../store/vaultStore'
import { useI18n } from '../../i18n'

export function MobileNav() {
  const { setShowPasswordGenerator, setShowSettings } = useUIStore()
  const { selectEntry, selectedEntry } = useEntriesStore()
  const { lock } = useVaultStore()
  const { t } = useI18n()
  const [showMore, setShowMore] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!showMore) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMore(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMore])

  const handleHome = () => {
    if (selectedEntry) {
      selectEntry(null as any)
    }
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-vault-surface border-t border-vault-border z-50">
        <div className="flex items-center justify-around h-16 px-2">
          <button
            onClick={handleHome}
            className="flex flex-col items-center justify-center w-16 h-full text-vault-text-secondary hover:text-vault-accent transition-colors"
          >
            <Home size={24} />
            <span className="text-xs mt-1">{t('all_entries')}</span>
          </button>
          <button
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('[data-search-input]')
              input?.focus()
            }}
            className="flex flex-col items-center justify-center w-16 h-full text-vault-text-secondary hover:text-vault-accent transition-colors"
          >
            <Search size={24} />
            <span className="text-xs mt-1">{t('search_placeholder').split('...')[0]}</span>
          </button>
          <button
            onClick={() => setShowPasswordGenerator(true)}
            className="flex flex-col items-center justify-center w-16 h-full text-vault-accent transition-colors"
          >
            <Plus size={28} />
            <span className="text-xs mt-1">{t('add')}</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex flex-col items-center justify-center w-16 h-full text-vault-text-secondary hover:text-vault-accent transition-colors"
          >
            <Settings size={24} />
            <span className="text-xs mt-1">{t('settings')}</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMore(!showMore)}
              className="flex flex-col items-center justify-center w-16 h-full text-vault-text-secondary hover:text-vault-accent transition-colors"
            >
              <MoreVertical size={24} />
              <span className="text-xs mt-1">Ещё</span>
            </button>
            {showMore && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-vault-surface border border-vault-border rounded-xl shadow-xl overflow-hidden z-50">
                <button
                  onClick={() => { lock(); setShowMore(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-vault-text hover:bg-vault-bg/50 transition-colors"
                >
                  <Lock size={18} className="text-vault-danger" />
                  {t('lock')}
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
