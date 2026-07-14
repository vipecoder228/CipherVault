import { app, BrowserWindow, shell, Tray, Menu, nativeImage, globalShortcut, screen, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import AutoLaunch from 'auto-launch'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIPC, unregisterIPC } from './ipc/ipcHandlers'
import { closeDatabase, getDatabase } from './db/connection'
import { lockVault } from './services/vault.service'
import { startWebSocketServer, stopWebSocketServer } from './services/websocket.service'
import { loadSyncSettings, stopSync } from './services/sync.service'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let currentShortcut: string = 'CommandOrControl+Shift+Space'

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
      sandbox: false,
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

function toggleWindow(): void {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    mainWindow.setSkipTaskbar(true)
  } else {
    mainWindow.show()
    mainWindow.setSkipTaskbar(false)
    mainWindow.focus()
  }
}

async function loadGlobalShortcut(): Promise<void> {
  try {
    const db = await getDatabase()
    const result = db.exec("SELECT value FROM settings WHERE key = 'global_shortcut'")
    if (result.length > 0 && result[0].values.length > 0) {
      currentShortcut = result[0].values[0][0] as string
    }
  } catch {}
}

function registerGlobalShortcuts(): void {
  // Unregister previous shortcut if any
  globalShortcut.unregisterAll()

  const registered = globalShortcut.register(currentShortcut, () => {
    toggleWindow()
  })

  if (!registered) {
    console.warn(`Failed to register global shortcut: ${currentShortcut}`)
  }
}

async function setGlobalShortcut(shortcut: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate shortcut format
    if (!shortcut || !shortcut.includes('+')) {
      return { success: false, error: 'Invalid shortcut format' }
    }

    // Try to register the new shortcut
    globalShortcut.unregisterAll()
    const registered = globalShortcut.register(shortcut, () => {
      toggleWindow()
    })

    if (!registered) {
      // Re-register old shortcut if new one fails
      globalShortcut.register(currentShortcut, () => {
        toggleWindow()
      })
      return { success: false, error: 'Failed to register shortcut. It may be in use by another app.' }
    }

    currentShortcut = shortcut

    // Save to database
    const db = await getDatabase()
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('global_shortcut', ?)", [shortcut])

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ciphervault.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPC()
  createWindow()
  createTray()
  await loadGlobalShortcut()
  registerGlobalShortcuts()
  startWebSocketServer()
  loadSyncSettings()

  // IPC handlers for global shortcut
  ipcMain.handle('shortcut:get', () => currentShortcut)
  ipcMain.handle('shortcut:set', (_: unknown, shortcut: string) => setGlobalShortcut(shortcut))

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
  globalShortcut.unregisterAll()
  stopWebSocketServer()
  stopSync()
  lockVault()
  unregisterIPC()
  closeDatabase()
})
