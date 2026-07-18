import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

export function initUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Don't check for updates in dev mode
  if (is.dev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Обновление доступно',
      message: `Доступна новая версия CipherVault v${info.version}`,
      buttons: ['Обновить', 'Позже'],
      defaultId: 0,
    })

    if (response === 0) {
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.setProgressBar(progress.percent / 100)
  })

  autoUpdater.on('update-downloaded', async () => {
    mainWindow?.setProgressBar(-1)

    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Обновление готово',
      message: 'Обновление загружено. Перезапустить сейчас?',
      buttons: ['Перезапустить', 'Позже'],
      defaultId: 0,
    })

    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message)
  })

  // Check for updates 3 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)
}
