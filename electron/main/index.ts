import { app, BrowserWindow, shell, Tray, Menu, nativeImage, globalShortcut, session, powerMonitor } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import AutoLaunch from 'auto-launch'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIPC, unregisterIPC, initShortcuts } from './ipc/ipcHandlers'
import { closeDatabase } from './db/connection'
import { lockVault } from './services/vault.service'
import { startWebSocketServer, stopWebSocketServer } from './services/websocket.service'
import { startBreachMonitor, stopBreachMonitor } from './services/breach-monitor.service'
import { logAuditEvent, stopAuditLog } from './security/auditLog'
import { verifyIntegrity } from './security/tamperDetection'
import { loadSyncSettings, stopSync } from './services/sync.service'
import { toggleWindow } from './utils/window'
import { initUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const autoLauncher = new AutoLaunch({
  name: 'CipherVault',
  path: app.getPath('exe'),
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f0f14',
  })

  // Never show window on ready — stay in tray
  mainWindow.on('ready-to-show', () => {
    // Hidden by default
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Hide to tray on blur
  mainWindow.on('blur', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
    }
  })

  // Lock vault when minimized
  mainWindow.on('minimize', () => {
    lockVault()
    mainWindow?.webContents.send('vault:locked')
  })

  // Minimize to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      mainWindow?.setSkipTaskbar(true)
      lockVault()
      return
    }
    lockVault()
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"]
      }
    })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function createTray(): Promise<void> {
  const iconPath = join(__dirname, '../../resources/tray-icon.svg')
  let icon: Electron.NativeImage

  try {
    const svgBuffer = readFileSync(iconPath)
    icon = nativeImage.createFromBuffer(svgBuffer)
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('CipherVault')

  const isAutoStart = await autoLauncher.isEnabled()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show CipherVault',
      click: () => toggleWindow(),
    },
    {
      label: 'Lock CipherVault',
      click: () => {
        lockVault()
        mainWindow?.webContents.send('vault:locked')
      },
    },
    { type: 'separator' },
    {
      label: 'Launch on startup',
      type: 'checkbox',
      checked: isAutoStart,
      click: async (menuItem) => {
        if (menuItem.checked) {
          await autoLauncher.enable()
        } else {
          await autoLauncher.disable()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    toggleWindow()
  })
}



app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ciphervault.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Security checks on startup
  const integrityCheck = verifyIntegrity()
  if (!integrityCheck.ok) {
    console.warn('[CipherVault] Integrity check failed:', integrityCheck.tamperedFiles)
  }

  registerIPC()
  await initShortcuts()
  createWindow()
  if (mainWindow) initUpdater(mainWindow)
  createTray()
  startWebSocketServer()
  loadSyncSettings()
  startBreachMonitor()

  // Log app start
  logAuditEvent('vault_unlocked', 'App started')

  // Lock vault when OS is locked/sleeping
  powerMonitor.on('lock-screen', () => {
    lockVault()
    mainWindow?.webContents.send('vault:locked')
  })
  powerMonitor.on('suspend', () => {
    lockVault()
    mainWindow?.webContents.send('vault:locked')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  lockVault()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  logAuditEvent('vault_locked', 'App shutting down')
  stopAuditLog()
  globalShortcut.unregisterAll()
  stopWebSocketServer()
  stopBreachMonitor()
  stopSync()
  lockVault()
  unregisterIPC()
  closeDatabase()
})
