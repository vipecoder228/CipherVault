import { useEffect } from 'react'
import { useVaultStore } from './store/vaultStore'
import { useUIStore } from './store/uiStore'
import { UnlockScreen } from './components/vault/UnlockScreen'
import { AppShell } from './components/layout/AppShell'
import { ToastContainer } from './components/ui/Toast'

export function App() {
  const { locked, initialized, checkStatus } = useVaultStore()
  const { theme } = useUIStore()

  useEffect(() => {
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

  return (
    <div className={`${theme}`}>
      {locked ? <UnlockScreen /> : <AppShell />}
      <ToastContainer />
    </div>
  )
}
