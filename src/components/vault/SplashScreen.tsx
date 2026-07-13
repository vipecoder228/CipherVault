import { useEffect, useRef, useState } from 'react'
import { Shield } from 'lucide-react'

const STEPS = [
  { progress: 20, status: 'Loading encryption modules...', delay: 200 },
  { progress: 40, status: 'Checking vault integrity...', delay: 400 },
  { progress: 60, status: 'Verifying digital signature...', delay: 300 },
  { progress: 80, status: 'Preparing secure environment...', delay: 300 },
  { progress: 100, status: 'Ready', delay: 200 },
]

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Initializing...')
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    let i = 0

    const run = () => {
      if (i >= STEPS.length) {
        timers.push(setTimeout(() => onCompleteRef.current(), 300))
        return
      }
      const step = STEPS[i]
      setProgress(step.progress)
      setStatus(step.status)
      timers.push(setTimeout(() => { i++; run() }, step.delay))
    }

    run()
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="h-screen flex items-center justify-center bg-vault-bg">
      <div className="flex flex-col items-center">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center animate-pulse-subtle">
            <Shield size={40} className="text-vault-accent" />
          </div>
          <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-vault-accent/20 blur-2xl" />
        </div>
        <h1 className="text-2xl font-bold text-vault-text mb-1">CipherVault</h1>
        <p className="text-xs text-vault-text-secondary mb-8">Secure Password Manager</p>
        <div className="w-64 space-y-3">
          <div className="h-1.5 rounded-full bg-vault-border overflow-hidden">
            <div
              className="h-full rounded-full bg-vault-accent transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-vault-text-secondary">{status}</p>
        </div>
      </div>
    </div>
  )
}
