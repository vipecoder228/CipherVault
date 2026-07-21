import { contextBridge, ipcRenderer } from 'electron'
import type { IPCChannels } from '../../shared/types'

const api: Record<string, (...args: any[]) => any> = {}

// All IPC channels the renderer can invoke
const channels: (keyof IPCChannels)[] = [
  'vault:status',
  'vault:setup',
  'vault:create',
  'vault:unlock',
  'vault:lock',
  'vault:switch',
  'vault:change-master-password',
  'vault:enable-totp',
  'vault:verify-totp',
  'vault:disable-totp',
  'vault:setup-alarm',
  'vault:change-alarm',
  'vault:remove-alarm',
  'vault:verify-password',
  'vault:get-kdf-salt',
  'entries:list',
  'entries:get',
  'entries:create',
  'entries:update',
  'entries:delete',
  'entries:restore',
  'entries:permanent-delete',
  'entries:deleted',
  'entries:cleanup-old',
  'entries:search',
  'entries:toggle-favorite',
  'entries:get-history',
  'entries:get-decrypted-history',
  'entries:get-totp',
  'entries:force-list',
  'entries:force-delete',
  'entries:panic-backup',
  'entries:complete-panic',
  'email:send-backup',
  'email:test-telegram',
  'email:get-chat-id',
  'email:save-telegram',
  'password:generate',
  'password:check-breach',
  'categories:list',
  'categories:create',
  'categories:update',
  'categories:delete',
  'categories:reorder',
  'clipboard:copy',
  'clipboard:clear',
  'settings:get',
  'settings:set',
  'settings:set-secure',
  'settings:get-secure',
  'disposable:create',
  'disposable:list',
  'disposable:messages',
  'disposable:message',
  'disposable:delete-message',
  'disposable:delete-account',
  'backup:export',
  'backup:import',
  'backup:import-panic',
  'health:analyze',
  'password:generate-username',
  'password:generate-passphrase',
  'sync:get-status',
  'sync:select-folder',
  'sync:set-password',
  'sync:now',
  'sync:disable',
  'sync:load-settings',
  'import:csv',
  'import:json',
  'export:csv',
  'export:json',
  'integrity:check',
  'shortcut:get',
  'shortcut:set',
]

for (const channel of channels) {
  api[channel] = (...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

// Expose event listener for main process -> renderer events
const ALLOWED_EVENTS = ['vault:locked', 'sync:imported']
api.on = (channel: string, callback: (...args: any[]) => void) => {
  if (!ALLOWED_EVENTS.includes(channel)) return () => {}
  const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
  ipcRenderer.on(channel, subscription)
  return () => {
    ipcRenderer.removeListener(channel, subscription)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
