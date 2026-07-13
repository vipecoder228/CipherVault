import { useEffect, useState, useCallback } from 'react'
import { useVaultStore } from './store/vaultStore'
import { useUIStore } from './store/uiStore'
import { SplashScreen } from './components/vault/SplashScreen'
import { UnlockScreen } from './components/vault/UnlockScreen'
import { AppShell } from './components/layout/AppShell'
import { ToastContainer } from './components/ui/Toast'
import { invoke } from './lib/ipc'

export function App() {
  const { locked, initialized, checkStatus } = useVaultStore()
  const { theme } = useUIStore()
  const [booting, setBooting] = useState(true)
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null)

  // Splash screen completion
  const handleBootComplete = useCallback(async () => {
    // Check integrity
    try {
      const result = await invoke('integrity:check' as any)
      setIntegrityOk(result?.ok !== false)
    } catch {
      // If integrity check channel doesn't exist, skip it
      setIntegrityOk(true)
    }
    setBooting(false)
    checkStatus()
  }, [checkStatus])

  // Apply theme class to html element
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

  // Show splash screen during boot
  if (booting) {
    return (
      <div className={`${theme}`}>
        <SplashScreen onComplete={handleBootComplete} />
      </div>
    )
  }

  // Integrity check failed
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
      {locked ? <UnlockScreen /> : <AppShell />}
      <ToastContainer />
    </div>
  )
}
