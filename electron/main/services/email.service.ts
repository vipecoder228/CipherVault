import { app, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'

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

export async function sendBackupEmail(
  to: string,
  backupData: string
): Promise<{ success: boolean; error?: string; filePath?: string }> {
  try {
    // 1. Save backup to file (always works, guaranteed)
    const filePath = saveBackupToFile(backupData)

    // 2. Open default email client with backup info
    const subject = encodeURIComponent('CipherVault Panic Backup')
    const body = encodeURIComponent(
      `CipherVault Panic Backup\n\n` +
      `Backup file saved to:\n${filePath}\n\n` +
      `Please attach the file to this email and send it.`
    )
    shell.openExternal(`mailto:${to}?subject=${subject}&body=${body}`)

    return { success: true, filePath }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save backup' }
  }
}
