import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { Paperclip, Download, Trash2, Plus, Loader2 } from 'lucide-react'
import type { AttachmentMeta } from '@shared/types'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentsSection({ entryId }: { entryId: number }) {
  const { t } = useI18n()
  const addToast = useToastStore((s) => s.addToast)
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await invoke('attachments:list', entryId)
      setAttachments(list)
    } catch {
      addToast(t('failed_to_load_attachments'), 'error')
    } finally {
      setLoading(false)
    }
  }, [entryId, addToast, t])

  useEffect(() => {
    load()
  }, [load])

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const data = new Uint8Array(buf)
      const meta = await invoke('attachments:add', entryId, file.name, file.type || 'application/octet-stream', data)
      setAttachments((prev) => [...prev, meta])
      addToast(t('attachment_uploaded'), 'success')
    } catch (err: any) {
      addToast(err?.message || t('failed_to_upload_attachment'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (attachment: AttachmentMeta) => {
    try {
      const result = await invoke('attachments:get', attachment.id)
      if (!result) throw new Error('not found')
      const blob = new Blob([result.data.slice().buffer], { type: result.meta.mime_type || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.meta.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast(t('failed_to_download_attachment'), 'error')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('confirm_delete_attachment'))) return
    setPendingDeleteId(id)
    try {
      await invoke('attachments:delete', id)
      setAttachments((prev) => prev.filter((a) => a.id !== id))
      addToast(t('attachment_deleted'), 'success')
    } catch {
      addToast(t('failed_to_delete_attachment'), 'error')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-vault-text-secondary flex items-center gap-1">
          <Paperclip size={12} />
          {t('attachments')}
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-xs text-vault-accent hover:text-vault-accent-hover transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {uploading ? t('uploading') : t('add_attachment')}
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
      </div>

      {loading ? (
        <p className="text-xs text-vault-text-secondary">{t('loading')}</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-vault-text-secondary">{t('no_attachments')}</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 h-10 px-3 rounded-lg bg-vault-surface border border-vault-border"
            >
              <span className="flex-1 text-sm text-vault-text truncate">{attachment.filename}</span>
              <span className="text-[10px] text-vault-text-secondary whitespace-nowrap">
                {formatFileSize(attachment.size)}
              </span>
              <button
                onClick={() => handleDownload(attachment)}
                className="p-1 text-vault-text-secondary hover:text-vault-accent transition-colors"
                title={t('download')}
              >
                <Download size={14} />
              </button>
              <button
                onClick={() => handleDelete(attachment.id)}
                disabled={pendingDeleteId === attachment.id}
                className="p-1 text-vault-text-secondary hover:text-vault-danger transition-colors disabled:opacity-50"
                title={t('delete')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
