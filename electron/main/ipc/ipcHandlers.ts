import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import type { IPCChannels } from '../../shared/types'
import * as vaultService from '../services/vault.service'
import * as entriesService from '../services/entries.service'
import * as clipboardService from '../services/clipboard.service'
import * as disposableEmailService from '../services/disposable-email.service'
import { generatePassword } from '../services/password-gen.service'
import { checkBreach } from '../services/breach-check.service'
import { getDatabase } from '../db/connection'
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories } from '../db/queries/categories.queries'
import { checkIntegrity } from '../integrity'

type IPCChannel = keyof IPCChannels

const handlers: Record<string, (...args: any[]) => any> = {
  // Vault
  'vault:status': () => vaultService.getVaultStatus(),
  'vault:setup': (_: unknown, masterPassword: string, alarmPassword?: string, displayName?: string) => vaultService.setupVault(masterPassword, alarmPassword, displayName),
  'vault:unlock': (_: unknown, masterPassword: string, totpCode?: string, vaultId?: number) => vaultService.unlockVault(masterPassword, totpCode, vaultId),
  'vault:lock': () => vaultService.lockVault(),
  'vault:switch': (_: unknown, vaultId: number) => vaultService.switchVault(vaultId),
  'vault:change-master-password': (_: unknown, oldPwd: string, newPwd: string, totpCode?: string) => vaultService.changeMasterPassword(oldPwd, newPwd, totpCode),
  'vault:enable-totp': () => vaultService.enableTOTP(),
  'vault:verify-totp': (_: unknown, code: string) => vaultService.verifyAndSaveTOTP(code),
  'vault:disable-totp': (_: unknown, totpCode: string) => vaultService.disableTOTP(totpCode),
  'vault:setup-alarm': (_: unknown, alarmPassword: string) => vaultService.setupAlarmPassword(alarmPassword),
  'vault:change-alarm': (_: unknown, oldAlarm: string, newAlarm: string) => vaultService.changeAlarmPassword(oldAlarm, newAlarm),
  'vault:remove-alarm': () => vaultService.removeAlarmPassword(),

  // Entries
  'entries:list': (_: unknown, filters?: any) => entriesService.listEntries(filters),
  'entries:get': (_: unknown, id: number) => entriesService.getEntry(id),
  'entries:create': (_: unknown, data: any) => entriesService.createEntry(data),
  'entries:update': (_: unknown, id: number, data: any) => entriesService.updateEntry(id, data),
  'entries:delete': (_: unknown, id: number) => entriesService.deleteEntryById(id),
  'entries:search': (_: unknown, query: string) => entriesService.searchEntries(query),
  'entries:toggle-favorite': (_: unknown, id: number) => entriesService.toggleFavoriteEntry(id),
  'entries:get-history': (_: unknown, id: number) => entriesService.getEntryHistoryList(id),
  'entries:get-decrypted-history': (_: unknown, id: number) => entriesService.getDecryptedHistory(id),
  'entries:get-totp': (_: unknown, id: number) => entriesService.getEntryTOTP(id),

  // Password
  'password:generate': (_: unknown, options: any) => generatePassword(options),
  'password:check-breach': (_: unknown, password: string) => checkBreach(password),

  // Categories
  'categories:list': async () => {
    const db = await getDatabase()
    return getCategories(db)
  },
  'categories:create': async (_: unknown, data: any) => {
    const db = await getDatabase()
    return createCategory(db, data.name, data.icon, data.color)
  },
  'categories:update': async (_: unknown, id: number, data: any) => {
    const db = await getDatabase()
    return updateCategory(db, id, data)
  },
  'categories:delete': async (_: unknown, id: number) => {
    const db = await getDatabase()
    return deleteCategory(db, id)
  },
  'categories:reorder': async (_: unknown, ids: number[]) => {
    const db = await getDatabase()
    return reorderCategories(db, ids)
  },

  // Clipboard
  'clipboard:copy': (_: unknown, text: string, ttl?: number) => clipboardService.copyToClipboard(text, ttl),
  'clipboard:clear': () => clipboardService.clearClipboard(),

  // Settings
  'settings:get': async (_: unknown, key: string) => {
    const db = await getDatabase()
    const result = db.exec('SELECT value FROM settings WHERE key = ?', [key])
    if (result.length === 0 || result[0].values.length === 0) return null
    return result[0].values[0][0] as string
  },
  'settings:set': async (_: unknown, key: string, value: string) => {
    const db = await getDatabase()
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  },

  // Disposable Emails
  'disposable:create': () => disposableEmailService.createDisposableEmailAddress(),
  'disposable:list': () => disposableEmailService.listDisposableEmails(),
  'disposable:messages': (_: unknown, emailId: number) => disposableEmailService.getDisposableEmailMessages(emailId),
  'disposable:message': (_: unknown, emailId: number, messageId: string) => disposableEmailService.getDisposableEmailMessage(emailId, messageId),
  'disposable:delete-message': (_: unknown, emailId: number, messageId: string) => disposableEmailService.deleteDisposableEmailMessage(emailId, messageId),
  'disposable:delete-account': (_: unknown, emailId: number) => disposableEmailService.deleteDisposableEmailAccount(emailId),

  // Integrity check
  'integrity:check': () => checkIntegrity(),

  // Import CSV
  'import:csv': async (_: unknown, filePath?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!filePath) {
      const result = await dialog.showOpenDialog(win!, {
        title: 'Import CSV',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { imported: 0, skipped: 0, errors: ['Cancelled'] }
      }
      filePath = result.filePaths[0]
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      const header = lines[0].toLowerCase()
      let imported = 0
      let skipped = 0
      const errors: string[] = []

      // Parse CSV header
      const cols = header.split(',').map(c => c.trim().replace(/"/g, ''))
      const nameIdx = cols.findIndex(c => c === 'name' || c === 'title')
      const urlIdx = cols.findIndex(c => c === 'url')
      const userIdx = cols.findIndex(c => c === 'username' || c === 'login' || c === 'email')
      const passIdx = cols.findIndex(c => c === 'password')

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCSVLine(lines[i])
          const title = nameIdx >= 0 ? values[nameIdx] : `Import ${i}`
          if (!title) { skipped++; continue }

          // Skip duplicates
          if (await isDuplicateEntry(title, userIdx >= 0 ? values[userIdx] : '')) {
            skipped++
            continue
          }

          await entriesService.createEntry({
            entry_type: 'login',
            title,
            username: userIdx >= 0 ? values[userIdx] : '',
            password: passIdx >= 0 ? values[passIdx] : '',
            url: urlIdx >= 0 ? values[urlIdx] : '',
          })
          imported++
        } catch (e: any) {
          errors.push(`Row ${i}: ${e.message}`)
          skipped++
        }
      }

      return { imported, skipped, errors }
    } catch (e: any) {
      return { imported: 0, skipped: 0, errors: [e.message] }
    }
  },

  // Import JSON
  'import:json': async (_: unknown, filePath?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!filePath) {
      const result = await dialog.showOpenDialog(win!, {
        title: 'Import JSON',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths[0]) {
        return { imported: 0, skipped: 0, errors: ['Cancelled'] }
      }
      filePath = result.filePaths[0]
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      const items = Array.isArray(data) ? data : data.items || data.entries || []
      let imported = 0
      let skipped = 0
      const errors: string[] = []

      for (const item of items) {
        try {
          const title = item.title || item.name || item.Login?.Name || ''
          if (!title) { skipped++; continue }

          const username = item.username || item.login || item.Login?.Username || ''

          // Skip duplicates
          if (await isDuplicateEntry(title, username)) {
            skipped++
            continue
          }

          await entriesService.createEntry({
            entry_type: item.type || 'login',
            title,
            username,
            password: item.password || item.Login?.Password || '',
            url: item.url || item.Login?.Url || '',
            notes: item.notes || item.Notes || '',
          })
          imported++
        } catch (e: any) {
          errors.push(`Item: ${e.message}`)
          skipped++
        }
      }

      return { imported, skipped, errors }
    } catch (e: any) {
      return { imported: 0, skipped: 0, errors: [e.message] }
    }
  },

  // Export CSV
  'export:csv': async (_: unknown, filePath?: string, entryIds?: number[]) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!filePath) {
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export CSV',
        defaultPath: 'vault-export.csv',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      })
      if (result.canceled || !result.filePath) return
      filePath = result.filePath
    }

    const entries = entryIds
      ? await Promise.all(entryIds.map(id => entriesService.getEntry(id)))
      : (await entriesService.listEntries()).map(e => ({ ...e } as any))

    const csvLines = ['name,url,username,password,notes']
    for (const entry of entries) {
      if (!entry) continue
      const e = entry as any
      const title = e.display_title || e.title || ''
      const username = e.username || ''
      const password = e.password || ''
      const url = e.url || ''
      const notes = (e.notes || '').replace(/\n/g, ' ')
      csvLines.push(`"${title}","${url}","${username}","${password}","${notes}"`)
    }

    writeFileSync(filePath, csvLines.join('\n'), 'utf-8')
  },

  // Export JSON
  'export:json': async (_: unknown, filePath?: string, entryIds?: number[]) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!filePath) {
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export JSON',
        defaultPath: 'vault-export.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return
      filePath = result.filePath
    }

    const entries = entryIds
      ? await Promise.all(entryIds.map(id => entriesService.getEntry(id)))
      : (await entriesService.listEntries()).map(e => ({ ...e } as any))

    const data = entries.filter(Boolean).map((entry: any) => ({
      title: entry.display_title || entry.title || '',
      username: entry.username || '',
      password: entry.password || '',
      url: entry.url || '',
      notes: entry.notes || '',
      type: entry.entry_type || 'login',
    }))

    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  },
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

async function isDuplicateEntry(title: string, username: string): Promise<boolean> {
  try {
    const db = await getDatabase()
    // We need to check display_title and also decrypt to check username
    // For simplicity, just check display_title match
    const result = db.exec(
      "SELECT COUNT(*) as count FROM encrypted_entries WHERE display_title = ?",
      [title]
    )
    if (result.length > 0 && result[0].values.length > 0) {
      return (result[0].values[0][0] as number) > 0
    }
  } catch {}
  return false
}

export function registerIPC(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }
}

export function unregisterIPC(): void {
  for (const channel of Object.keys(handlers)) {
    ipcMain.removeHandler(channel)
  }
}
