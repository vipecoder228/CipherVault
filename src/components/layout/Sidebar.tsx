import { useEffect, useState } from 'react'
import { invoke } from '../../lib/ipc'
import { useEntriesStore } from '../../store/entriesStore'
import { useUIStore } from '../../store/uiStore'
import { useVaultStore } from '../../store/vaultStore'
import { CategoryForm } from '../categories/CategoryForm'
import { SettingsPanel } from '../settings/SettingsPanel'
import { ImportDialog } from '../import-export/ImportDialog'
import { VaultSwitcher } from '../vault/VaultSwitcher'
import type { Category } from '@shared/types'
import {
  Shield, Star, LayoutGrid, Settings, Lock, Mail,
  Plus, ChevronLeft, ChevronRight, Folder, Pencil, Trash2, Download
} from 'lucide-react'
import { useI18n } from '../../i18n'

export function Sidebar() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [showImport, setShowImport] = useState(false)
  const { activeCategoryId, setActiveCategory, sidebarCollapsed, toggleSidebar, showSettings, setShowSettings, showDisposableEmail, setShowDisposableEmail, showTrash, setShowTrash } = useUIStore()
  const { setFilters } = useEntriesStore()
  const { lock, activeVaultId, vaults } = useVaultStore()

  const currentVault = vaults.find(v => v.id === activeVaultId)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const cats = await invoke('categories:list')
      setCategories(cats)
    } catch {}
  }

  const handleCategoryClick = (categoryId: number | null) => {
    setActiveCategory(categoryId)
    setFilters({ category_id: categoryId })
  }

  const handleDeleteCategory = async (id: number) => {
    if (!confirm(t('delete_category_confirm'))) return
    try {
      await invoke('categories:delete', id)
      await loadCategories()
      if (activeCategoryId === id) {
        setActiveCategory(null)
        setFilters({ category_id: null })
      }
    } catch {}
  }

  return (
    <>
      <div className="h-full bg-vault-surface border-r border-vault-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-vault-border">
          {!sidebarCollapsed ? (
            <VaultSwitcher />
          ) : (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
            >
              <Shield size={20} className="text-vault-accent" />
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            <NavItem
              icon={<LayoutGrid size={18} />}
              label={t('all_entries')}
              active={activeCategoryId === null}
              collapsed={sidebarCollapsed}
              onClick={() => handleCategoryClick(null)}
            />
            <NavItem
              icon={<Star size={18} />}
              label={t('favorites')}
              active={false}
              collapsed={sidebarCollapsed}
              onClick={() => setFilters({ is_favorite: true })}
            />
            <NavItem
              icon={<Mail size={18} />}
              label={t('temp_email')}
              active={showDisposableEmail}
              collapsed={sidebarCollapsed}
              onClick={() => { setShowDisposableEmail(!showDisposableEmail); setShowSettings(false); setShowTrash(false) }}
            />
            <NavItem
              icon={<Trash2 size={18} />}
              label={t('trash')}
              active={showTrash}
              collapsed={sidebarCollapsed}
              onClick={() => { setShowTrash(!showTrash); setShowSettings(false); setShowDisposableEmail(false) }}
            />
            {!sidebarCollapsed && showDisposableEmail && (
              <p className="px-3 text-[10px] text-vault-text-secondary leading-tight">
                {t('disposable_email_hint')}
              </p>
            )}
          </div>

          {/* Categories */}
          {!sidebarCollapsed && (
            <div className="mt-6">
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-xs font-medium text-vault-text-secondary uppercase tracking-wider">
                  {t('categories')}
                </span>
                <button
                  onClick={() => setShowCategoryForm(true)}
                  className="p-1 rounded text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-1">
                {categories.map((cat) => (
                  <div key={cat.id} className="group relative">
                    <NavItem
                      icon={<Folder size={18} style={{ color: cat.color }} />}
                      label={cat.name}
                      active={activeCategoryId === cat.id}
                      collapsed={sidebarCollapsed}
                      onClick={() => handleCategoryClick(cat.id)}
                    />
                    {/* Edit/Delete buttons on hover */}
                    {!sidebarCollapsed && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingCategory(cat) }}
                          className="p-1 rounded text-vault-text-secondary hover:text-vault-accent transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                          className="p-1 rounded text-vault-text-secondary hover:text-vault-danger transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-vault-border space-y-1">
          <NavItem
            icon={<Download size={18} />}
            label={t('import')}
            collapsed={sidebarCollapsed}
            onClick={() => setShowImport(true)}
          />
          <NavItem
            icon={<Settings size={18} />}
            label={t('settings')}
            collapsed={sidebarCollapsed}
            onClick={() => setShowSettings(true)}
          />
          <NavItem
            icon={<Lock size={18} />}
            label={t('lock')}
            collapsed={sidebarCollapsed}
            onClick={lock}
          />
        </div>
      </div>

      <CategoryForm
        open={showCategoryForm}
        onClose={() => setShowCategoryForm(false)}
        onCreated={loadCategories}
      />
      <CategoryForm
        open={!!editingCategory}
        onClose={() => setEditingCategory(null)}
        onCreated={loadCategories}
        initialData={editingCategory}
      />
      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </>
  )
}

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${
        active
          ? 'bg-vault-accent/10 text-vault-accent'
          : 'text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed && <span className="text-sm">{label}</span>}
    </button>
  )
}
