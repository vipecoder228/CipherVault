import { useEffect, useState, useCallback, useRef } from 'react'
import { useVaultStore } from './store/vaultStore'
import { useUIStore } from './store/uiStore'
import { useEntriesStore } from './store/entriesStore'
import { SplashScreen } from './components/vault/SplashScreen'
import { UnlockScreen } from './components/vault/UnlockScreen'
import { PanicChoiceScreen } from './components/vault/PanicChoiceScreen'
import { AppShell } from './components/layout/AppShell'
import { MobileAppShell } from './components/mobile/MobileAppShell'
import { ToastContainer } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { invoke } from './lib/ipc'
import { isCapacitor } from '../shared/bridge'

// Detect if we're on a mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

const FONT_SIZE_CLASSES: Record<string, string> = {
  small: 'text-[13px]',
  normal: 'text-sm',
  large: 'text-base',
}

export function App() {
  const { locked, checkStatus, alarmMode, lock } = useVaultStore()
  const { theme, fontSize } = useUIStore()
  const [booting, setBooting] = useState(true)
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [panicChoice, setPanicChoice] = useState<'empty' | 'wipe' | null>(null)
  const checkStatusRef = useRef(checkStatus)
  checkStatusRef.current = checkStatus
  const lockRef = useRef(lock)
  lockRef.current = lock

  // Check if we're on mobile
  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => {
      setIsMobile(isMobileDevice())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-lock on Capacitor when app goes to background
  useEffect(() => {
    if (!isCapacitor) return

    import('./capacitor/bridge').then(({ onAppStateChange }) => {
      onAppStateChange((state) => {
        if (state === 'background' && !locked) {
          lockRef.current()
        }
      })
    }).catch(() => {})
  }, [locked])

  const handleBootComplete = useCallback(async () => {
    try {
      const result = await invoke('integrity:check' as any)
      setIntegrityOk(result?.ok !== false)
    } catch {
      setIntegrityOk(true)
    }
    setBooting(false)
    checkStatusRef.current()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.remove('light')
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
      root.classList.add('light')
    }
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('text-[13px]', 'text-sm', 'text-base')
    root.classList.add(FONT_SIZE_CLASSES[fontSize])
  }, [fontSize])

  // Listen for sync:imported events (from cloud sync)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.on) {
      const cleanup = window.electronAPI.on('sync:imported', () => {
        useEntriesStore.getState().loadEntries()
      })
      return cleanup
    }
  }, [])

  // Auto-lock on inactivity — resets the backend's auto-lock timer (which reads
  // the user's configured auto_lock_ms setting), throttled to avoid IPC spam.
  useEffect(() => {
    if (locked) return

    const THROTTLE_MS = 5000
    let lastReset = 0

    const resetTimer = () => {
      const now = Date.now()
      if (now - lastReset < THROTTLE_MS) return
      lastReset = now
      invoke('vault:reset-timer').catch(() => {})
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(event => document.addEventListener(event, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      events.forEach(event => document.removeEventListener(event, resetTimer))
    }
  }, [locked])

  // Start breach monitor on Capacitor when unlocked
  useEffect(() => {
    if (!isCapacitor || locked) return

    import('./lib/webBackend').then(({ startBreachMonitorLocal }) => {
      startBreachMonitorLocal()
    }).catch(() => {})
  }, [locked])

  if (booting) {
    return (
      <div className={`${theme}`}>
        <SplashScreen onComplete={handleBootComplete} />
      </div>
    )
  }

  if (integrityOk === false) {
    return (
      <div className={`${theme}`}>
        <div className="h-screen flex items-center justify-center bg-vault-bg">
          <div className="text-center max-w-md mx-4">
            <div className="w-16 h-16 rounded-2xl bg-vault-danger/10 border border-vault-danger/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-lg font-bold text-vault-text mb-2">Integrity Check Failed</h1>
            <p className="text-sm text-vault-text-secondary">
              This application may have been tampered with or modified.
              Please download the latest version from the official source.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className={`${theme}`}>
        <div className="animate-fade-in">
          {locked ? (
            <UnlockScreen />
          ) : alarmMode && panicChoice === null ? (
            <PanicChoiceScreen onDone={() => {
              setPanicChoice('wipe')
              // Lock to exit alarm mode once the wipe finishes
              useVaultStore.getState().lock()
            }} />
          ) : (
            isMobile ? <MobileAppShell /> : <AppShell />
          )}
          <ToastContainer />
        </div>
      </div>
    </ErrorBoundary>
  )
}
