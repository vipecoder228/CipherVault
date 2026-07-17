import { useEffect, useState, useCallback, useRef } from 'react'
import { useVaultStore } from './store/vaultStore'
import { useUIStore } from './store/uiStore'
import { useEntriesStore } from './store/entriesStore'
import { SplashScreen } from './components/vault/SplashScreen'
import { UnlockScreen } from './components/vault/UnlockScreen'
import { AppShell } from './components/layout/AppShell'
import { MobileAppShell } from './components/mobile/MobileAppShell'
import { ToastContainer } from './components/ui/Toast'
import { invoke } from './lib/ipc'

// Detect if we're on a mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function App() {
  const { locked, initialized, checkStatus } = useVaultStore()
  const { theme } = useUIStore()
  const [booting, setBooting] = useState(true)
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const checkStatusRef = useRef(checkStatus)
  checkStatusRef.current = checkStatus

  // Check if we're on mobile
  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => {
      setIsMobile(isMobileDevice())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Listen for sync:imported events (from cloud sync)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.on) {
      const cleanup = window.electronAPI.on('sync:imported', () => {
        useEntriesStore.getState().loadEntries()
      })
      return cleanup
    }
  }, [])

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
    <div className={`${theme}`}>
      {locked ? <UnlockScreen /> : (isMobile ? <MobileAppShell /> : <AppShell />)}
      <ToastContainer />
    </div>
  )
}
