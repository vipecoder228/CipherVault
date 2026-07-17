import nodemailer from 'nodemailer'
import { app, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { getDatabase } from '../db/connection'

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = 'smtp_config'")
    if (result.length === 0 || result[0].values.length === 0) return null
    return JSON.parse(result[0].values[0][0] as string)
  } catch {
    return null
  }
}

function getBackupDir(): string {
  const dir = join(app.getPath('userData'), 'panic-backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function saveBackupToFile(backupData: string): string {
  const dir = getBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(dir, `panic-backup-${timestamp}.json`)
  writeFileSync(filePath, backupData, 'utf-8')
  return filePath
}

async function sendViaSmtp(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const config = await getSmtpConfig()
  if (!config) return false

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    })

    await transporter.sendMail({
      from: `"CipherVault Backup" <${config.user}>`,
      to,
      subject,
      text,
      html,
    })

    transporter.close()
    return true
  } catch {
    return false
  }
}

export async function sendBackupEmail(
  to: string,
  backupData: string
): Promise<{ success: boolean; error?: string; filePath?: string }> {
  try {
    // 1. Always save backup to file (guaranteed)
    const filePath = saveBackupToFile(backupData)

    const timestamp = new Date().toISOString()
    const subject = `CipherVault Panic Backup — ${timestamp}`
    const text = `CipherVault Panic Backup\nTimestamp: ${timestamp}\nBackup saved to: ${filePath}\n\n${backupData}`
    const html = `
      <div style="font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #ff6b6b;">CipherVault Panic Backup</h2>
        <p>Timestamp: ${timestamp}</p>
        <p>Backup saved to: <code>${filePath}</code></p>
        <hr style="border-color: #333;" />
        <pre style="white-space: pre-wrap; word-break: break-all; font-size: 12px;">${escapeHtml(backupData)}</pre>
      </div>
    `

    // 2. Try SMTP if configured
    const smtpSent = await sendViaSmtp(to, subject, text, html)

    if (smtpSent) {
      return { success: true, filePath }
    }

    // 3. Fallback: open email client
    const mailtoBody = encodeURIComponent(
      `CipherVault Panic Backup\n\nBackup file saved to:\n${filePath}\n\nPlease attach the file to this email and send it.`
    )
    shell.openExternal(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${mailtoBody}`)

    return { success: true, filePath }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save backup' }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
