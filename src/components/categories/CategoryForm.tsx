import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  initialData?: { id: number; name: string; icon: string; color: string } | null
}

const ICONS = ['folder', 'briefcase', 'heart', 'star', 'home', 'globe', 'credit-card', 'key', 'user', 'lock', 'shield', 'mail', 'phone', 'car', 'gamepad-2', 'music', 'camera']
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#f97316', '#64748b']

export function CategoryForm({ open, onClose, onCreated, initialData }: Props) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('folder')
  const [color, setColor] = useState('#6366f1')

  // Set initial data for edit mode
  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name)
      setIcon(initialData.icon)
      setColor(initialData.color)
    } else if (open) {
      setName('')
      setIcon('folder')
      setColor('#6366f1')
    }
  }, [open, initialData])
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async () => {
    if (!name.trim()) {
      addToast('Name is required', 'warning')
      return
    }
    setLoading(true)
    try {
      if (initialData) {
        await invoke('categories:update', initialData.id, { name: name.trim(), icon, color })
        addToast('Category updated', 'success')
      } else {
        await invoke('categories:create', { name: name.trim(), icon, color })
        addToast('Category created', 'success')
      }
      handleClose()
      onCreated?.()
    } catch {
      addToast(initialData ? 'Failed to update category' : 'Failed to create category', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setIcon('folder')
    setColor('#6366f1')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={initialData ? "Edit Category" : "New Category"}>
      <div className="space-y-5">
        <Input
          label="Name"
          placeholder="e.g. Work, Personal, Finance"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {/* Icon picker */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg border transition-all ${
                  icon === ic
                    ? 'border-vault-accent bg-vault-accent/10 scale-110'
                    : 'border-vault-border bg-vault-surface hover:border-vault-accent/30'
                }`}
              >
                {getIconEmoji(ic)}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="text-xs font-medium text-vault-text-secondary mb-2 block">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (initialData ? 'Saving...' : 'Creating...') : (initialData ? 'Save Changes' : 'Create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function getIconEmoji(icon: string): string {
  const map: Record<string, string> = {
    folder: '📁', briefcase: '💼', heart: '❤️', star: '⭐',
    home: '🏠', globe: '🌐', 'credit-card': '💳', key: '🔑',
    user: '👤', lock: '🔒', shield: '🛡️', mail: '📧',
    phone: '📱', car: '🚗', 'gamepad-2': '🎮', music: '🎵', camera: '📷',
  }
  return map[icon] || '📁'
}
