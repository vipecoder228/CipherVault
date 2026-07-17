import nodemailer from 'nodemailer'

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter

  // Use direct SMTP delivery — sends directly to recipient's MX record
  // No external service or configuration required
  transporter = nodemailer.createTransport({
    // @ts-ignore — 'direct' is supported but not in the types
    direct: true,
    name: 'ciphervault.local',
  })

  return transporter
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = getTransporter()
    await transport.sendMail({
      from: '"CipherVault Backup" <backup@ciphervault.local>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send email' }
  }
}

export async function sendBackupEmail(
  to: string,
  backupData: string
): Promise<{ success: boolean; error?: string }> {
  const timestamp = new Date().toISOString()
  const subject = `CipherVault Panic Backup — ${timestamp}`
  const text = `CipherVault Panic Backup\nTimestamp: ${timestamp}\n\n${backupData}`
  const html = `
    <div style="font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px; border-radius: 8px;">
      <h2 style="color: #ff6b6b;">CipherVault Panic Backup</h2>
      <p>Timestamp: ${timestamp}</p>
      <p>This backup was triggered by the panic/duress feature.</p>
      <hr style="border-color: #333;" />
      <pre style="white-space: pre-wrap; word-break: break-all; font-size: 12px;">${escapeHtml(backupData)}</pre>
    </div>
  `
  return sendEmail({ to, subject, text, html })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
