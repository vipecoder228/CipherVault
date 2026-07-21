import { app, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { saveSecret, getSecret } from './secretStorage'

// ─── Backup File Storage ────────────────────────────────

function getBackupDir(): string {
  const dir = join(app.getPath('userData'), 'panic-backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function saveBackupToFile(backupData: string): string {
  const dir = getBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(dir, `panic-backup-${timestamp}.enc`)
  writeFileSync(filePath, backupData, 'utf-8')
  return filePath
}

// ─── Telegram Bot API ───────────────────────────────────

async function getTelegramToken(): Promise<string | null> {
  return getSecret('telegram_bot_token')
}

async function getTelegramChatId(): Promise<string | null> {
  return getSecret('telegram_chat_id')
}

async function sendViaTelegram(chatId: string, backupData: string, filePath: string): Promise<boolean> {
  const token = await getTelegramToken()
  if (!token) return false

  try {
    const timestamp = new Date().toISOString()

    // Send info message
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔐 CipherVault Panic Backup\n\nTimestamp: ${timestamp}\n\nUse your backup password to decrypt this file.`,
      }),
    })

    // Send encrypted file as document
    const fileBuffer = readFileSync(filePath)
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', new Blob([fileBuffer], { type: 'application/octet-stream' }), 'panic-backup.enc')
    formData.append('caption', `Encrypted backup — ${timestamp}`)

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
    })

    return res.ok
  } catch {
    return false
  }
}

export async function testTelegramConnection(token: string): Promise<{ ok: boolean; botName?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()
    if (data.ok) {
      return { ok: true, botName: data.result.username }
    }
    return { ok: false, error: data.description || 'Invalid token' }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function getTelegramChatIdFromToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
    const data = await res.json()
    if (data.ok && data.result?.length > 0) {
      const lastUpdate = data.result[data.result.length - 1]
      const chatId = lastUpdate.message?.chat?.id || lastUpdate.my_chat_member?.chat?.id
      return chatId ? String(chatId) : null
    }
    return null
  } catch {
    return null
  }
}

export async function saveTelegramConfig(token: string, chatId: string): Promise<void> {
  await saveSecret('telegram_bot_token', token)
  await saveSecret('telegram_chat_id', chatId)
}

// ─── Breach Notifications ────────────────────────────────

export async function sendBreachNotification(entryTitle: string, breachCount: number): Promise<boolean> {
  const chatId = await getTelegramChatId()
  if (!chatId) return false

  const token = await getTelegramToken()
  if (!token) return false

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ CipherVault Breach Alert\n\nEntry: ${entryTitle}\nFound in ${breachCount} data breach${breachCount > 1 ? 'es' : ''}\n\nPlease change this password immediately.`,
      }),
    })
    return true
  } catch {
    return false
  }
}

// ─── Main Export ─────────────────────────────────────────

export async function sendBackup(
  backupData: string
): Promise<{ success: boolean; error?: string; filePath?: string; sent?: boolean; sentVia?: string }> {
  try {
    // 1. Always save to file (guaranteed)
    const filePath = saveBackupToFile(backupData)

    // 2. Try Telegram if configured
    const chatId = await getTelegramChatId()
    if (chatId) {
      const sent = await sendViaTelegram(chatId, backupData, filePath)
      if (sent) {
        return { success: true, filePath, sent: true, sentVia: 'telegram' }
      }
    }

    // 3. Fallback: open email client
    const timestamp = new Date().toISOString()
    const mailtoBody = encodeURIComponent(
      `CipherVault Encrypted Backup\n\nEncrypted backup saved to:\n${filePath}\n\nAttach the file and send it.`
    )
    shell.openExternal(`mailto:?subject=${encodeURIComponent(`CipherVault Backup — ${timestamp}`)}&body=${mailtoBody}`)

    return { success: true, filePath, sent: false }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save backup' }
  }
}
