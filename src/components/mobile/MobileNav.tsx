import { Home, Plus, Search, Settings, Shield } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useEntriesStore } from '../../store/entriesStore'

type NavItem = {
  id: string
  icon: React.ReactNode
  label: string
  onClick: () => void
}

export function MobileNav() {
  const { setShowPasswordGenerator, setShowSettings } = useUIStore()
  const { selectEntry, selectedEntry } = useEntriesStore()

  const handleHome = () => {
    if (selectedEntry) {
      selectEntry(null as any)
    }
  }

  const navItems: NavItem[] = [
    {
      id: 'home',
      icon: <Home size={24} />,
      label: 'Главная',
      onClick: handleHome,
    },
    {
      id: 'search',
      icon: <Search size={24} />,
      label: 'Поиск',
      onClick: () => {
        // Focus search input
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
        searchInput?.focus()
      },
    },
    {
      id: 'add',
      icon: <Plus size={24} />,
      label: 'Добавить',
      onClick: () => setShowPasswordGenerator(true),
    },
    {
      id: 'security',
      icon: <Shield size={24} />,
      label: 'Безопасность',
      onClick: () => setShowSettings(true),
    },
    {
      id: 'settings',
      icon: <Settings size={24} />,
      label: 'Настройки',
      onClick: () => setShowSettings(true),
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-vault-surface border-t border-vault-border z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className="flex flex-col items-center justify-center w-16 h-full text-vault-text-secondary hover:text-vault-accent transition-colors"
          >
            {item.icon}
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
