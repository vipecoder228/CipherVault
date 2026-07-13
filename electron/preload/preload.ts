import { contextBridge, ipcRenderer } from 'electron'
import type { IPCChannels } from '../../shared/types'

const api: Record<string, (...args: any[]) => Promise<any>> = {}

// All IPC channels the renderer can invoke
const channels: (keyof IPCChannels)[] = [
  'vault:status',
  'vault:setup',
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
  'entries:list',
  'entries:get',
  'entries:create',
  'entries:update',
  'entries:delete',
  'entries:search',
  'entries:toggle-favorite',
  'entries:get-history',
  'entries:get-decrypted-history',
  'entries:get-totp',
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
  'disposable:create',
  'disposable:list',
  'disposable:messages',
  'disposable:message',
  'disposable:delete-message',
  'disposable:delete-account',
  'import:csv',
  'import:json',
  'export:csv',
  'export:json',
  'integrity:check',
]

for (const channel of channels) {
  api[channel] = (...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

// Expose event listener for main process -> renderer events
api.on = (channel: string, callback: (...args: any[]) => void) => {
  const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
  ipcRenderer.on(channel, subscription)
  return () => {
    ipcRenderer.removeListener(channel, subscription)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
