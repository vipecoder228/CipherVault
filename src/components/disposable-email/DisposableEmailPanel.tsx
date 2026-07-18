import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import {
  Mail, Plus, Trash2, ArrowLeft, Copy, RefreshCw, Inbox
} from 'lucide-react'

interface DisposableEmail {
  id: number
  address: string
  createdAt: string
}

interface EmailMessage {
  id: string
  from: string
  subject: string
  intro: string
  createdAt: string
  size: number
}

interface EmailMessageDetail {
  id: string
  from: string
  subject: string
  text: string
  html: string
  createdAt: string
}

export function DisposableEmailPanel() {
  const { t } = useI18n()
  const [emails, setEmails] = useState<DisposableEmail[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<DisposableEmail | null>(null)
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<EmailMessageDetail | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    loadEmails()
  }, [])

  const loadEmails = async () => {
    setLoading(true)
    try {
      const list = await invoke('disposable:list')
      setEmails(list)
    } catch (e: any) {
      addToast(e?.message || t('failed_load_emails'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await invoke('disposable:create')
      addToast(t('email_created', { address: result.address }), 'success')
      await loadEmails()
    } catch (e: any) {
      addToast(e?.message || t('failed_create_email'), 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleSelectEmail = async (email: DisposableEmail) => {
    setSelectedEmail(email)
    setSelectedMessage(null)
    setLoadingMessages(true)
    try {
      const msgs = await invoke('disposable:messages', email.id)
      setMessages(msgs)
    } catch (e: any) {
      addToast(e?.message || t('failed_load_messages'), 'error')
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSelectMessage = async (messageId: string) => {
    if (!selectedEmail) return
    setLoadingMessage(true)
    try {
      const msg = await invoke('disposable:message', selectedEmail.id, messageId)
      setSelectedMessage(msg)
    } catch (e: any) {
      addToast(e?.message || t('failed_load_message'), 'error')
    } finally {
      setLoadingMessage(false)
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedEmail) return
    try {
      await invoke('disposable:delete-message', selectedEmail.id, messageId)
      setMessages(messages.filter(m => m.id !== messageId))
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null)
      }
      addToast(t('message_deleted'), 'success')
    } catch (e: any) {
      addToast(e?.message || t('failed_delete_message'), 'error')
    }
  }

  const handleDeleteAccount = async (email: DisposableEmail) => {
    if (!confirm(t('confirm_delete_email', { address: email.address }))) return
    try {
      await invoke('disposable:delete-account', email.id)
      setEmails(emails.filter(e => e.id !== email.id))
      if (selectedEmail?.id === email.id) {
        setSelectedEmail(null)
        setSelectedMessage(null)
        setMessages([])
      }
      addToast(t('email_deleted'), 'success')
    } catch (e: any) {
      addToast(e?.message || t('failed_delete_email'), 'error')
    }
  }

  const handleCopyAddress = async (address: string) => {
    try {
      await invoke('clipboard:copy', address, 30000)
      addToast(t('copied_toast'), 'success')
    } catch {
      addToast(t('failed_copy'), 'error')
    }
  }

  const handleRefreshMessages = async () => {
    if (!selectedEmail) return
    setLoadingMessages(true)
    try {
      const msgs = await invoke('disposable:messages', selectedEmail.id)
      setMessages(msgs)
      addToast(t('refreshed'), 'success')
    } catch (e: any) {
      addToast(e?.message || t('failed_refresh'), 'error')
    } finally {
      setLoadingMessages(false)
    }
  }

  // Message detail view
  if (selectedMessage) {
    return (
      <div className="h-full flex flex-col bg-vault-bg">
        <div className="flex items-center gap-3 p-4 border-b border-vault-border">
          <button
            onClick={() => setSelectedMessage(null)}
            className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-vault-text truncate">{selectedMessage.subject}</h3>
            <p className="text-xs text-vault-text-secondary">{t('from')}: {selectedMessage.from}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-xs text-vault-text-secondary mb-4">
            {new Date(selectedMessage.createdAt).toLocaleString()}
          </div>
          {selectedMessage.text ? (
            <pre className="text-sm text-vault-text whitespace-pre-wrap font-sans">{selectedMessage.text}</pre>
          ) : selectedMessage.html ? (
            <div className="text-sm text-vault-text prose prose-sm max-w-none">
              <iframe
                srcDoc={selectedMessage.html}
                sandbox=""
                className="w-full border-0 min-h-[200px]"
                title="Email content"
              />
            </div>
          ) : (
            <p className="text-sm text-vault-text-secondary italic">{t('no_content')}</p>
          )}
        </div>
      </div>
    )
  }

  // Messages list view
  if (selectedEmail) {
    return (
      <div className="h-full flex flex-col bg-vault-bg">
        <div className="flex items-center gap-3 p-4 border-b border-vault-border">
          <button
            onClick={() => { setSelectedEmail(null); setMessages([]) }}
            className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-vault-text truncate">{selectedEmail.address}</h3>
          </div>
          <button
            onClick={() => handleCopyAddress(selectedEmail.address)}
            className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors"
            title={t('copy_address')}
          >
            <Copy size={14} />
          </button>
          <button
            onClick={handleRefreshMessages}
            disabled={loadingMessages}
            className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-text transition-colors"
            title={t('refresh')}
          >
            <RefreshCw size={14} className={loadingMessages ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-vault-text-secondary">
              <Inbox size={24} className="mb-2 opacity-50" />
              <p className="text-sm">{t('no_messages_yet')}</p>
              <p className="text-xs mt-1">{t('send_email_to', { address: selectedEmail.address })}</p>
            </div>
          ) : (
            <div className="divide-y divide-vault-border">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg.id)}
                  className="p-4 hover:bg-vault-surface-hover cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-vault-text truncate">{msg.subject || t('no_subject')}</p>
                      <p className="text-xs text-vault-text-secondary mt-0.5">{t('from')}: {msg.from}</p>
                      <p className="text-xs text-vault-text-secondary mt-1 line-clamp-2">{msg.intro}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-vault-text-secondary">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id) }}
                        className="p-1 rounded text-vault-text-secondary hover:text-vault-danger transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Email list view
  return (
    <div className="h-full flex flex-col bg-vault-bg">
      <div className="flex items-center justify-between p-4 border-b border-vault-border">
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-vault-accent" />
          <h2 className="text-sm font-semibold text-vault-text">{t('disposable_email_title')}</h2>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-vault-accent text-white rounded-lg text-xs font-medium hover:bg-vault-accent-hover transition-colors disabled:opacity-50"
        >
          {creating ? (
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          {creating ? t('creating') : t('new')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-vault-text-secondary">
            <Mail size={24} className="mb-2 opacity-50" />
            <p className="text-sm">{t('no_disposable_emails')}</p>
            <p className="text-xs mt-1">{t('create_to_get_started')}</p>
          </div>
        ) : (
          <div className="divide-y divide-vault-border">
            {emails.map((email) => (
              <div
                key={email.id}
                className="p-4 hover:bg-vault-surface-hover transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => handleSelectEmail(email)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <p className="text-sm font-medium text-vault-text truncate font-mono">{email.address}</p>
                    <p className="text-xs text-vault-text-secondary mt-0.5">
                      {t('created')} {new Date(email.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopyAddress(email.address)}
                      className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-accent transition-colors"
                      title={t('copy_address')}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(email)}
                      className="p-1.5 rounded-lg text-vault-text-secondary hover:text-vault-danger transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
