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
  const filePath = join(dir, `panic-backup-${timestamp}.enc`)
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
      attachments: [{
        filename: 'panic-backup.enc',
        content: text,
      }],
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
): Promise<{ success: boolean; error?: string; filePath?: string; emailed?: boolean }> {
  try {
    // 1. Always save encrypted backup to file (guaranteed)
    const filePath = saveBackupToFile(backupData)

    const timestamp = new Date().toISOString()
    const subject = `CipherVault Encrypted Backup — ${timestamp}`
    const text = `Encrypted backup attached.\n\nUse your backup password to decrypt.`
    const html = `
      <div style="font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #ff6b6b;">CipherVault Encrypted Backup</h2>
        <p>Timestamp: ${timestamp}</p>
        <p>Encrypted backup file attached.</p>
        <p>Use your backup password to decrypt.</p>
      </div>
    `

    // 2. Try SMTP if configured
    const smtpSent = await sendViaSmtp(to, subject, text, html)

    if (smtpSent) {
      return { success: true, filePath, emailed: true }
    }

    // 3. Fallback: open email client
    const mailtoBody = encodeURIComponent(
      `CipherVault Encrypted Backup\n\nEncrypted backup saved to:\n${filePath}\n\nAttach the file and send it.`
    )
    shell.openExternal(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${mailtoBody}`)

    return { success: true, filePath, emailed: false }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save backup' }
  }
}

export async function saveSmtpConfig(config: SmtpConfig): Promise<void> {
  const db = await getDatabase()
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('smtp_config', ?)", [JSON.stringify(config)])
  // Don't saveDatabase here — caller should save
}
