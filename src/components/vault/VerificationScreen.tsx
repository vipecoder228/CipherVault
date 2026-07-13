import { useState, useEffect, useCallback } from 'react'
import { OtpInput } from '../ui/OtpInput'
import { Shield } from 'lucide-react'

interface VerificationScreenProps {
  title?: string
  subtitle?: string
  onVerify: (code: string) => Promise<boolean>
  onCancel?: () => void
  loading?: boolean
}

export function VerificationScreen({
  title = 'Verification',
  subtitle = 'Enter your 6-digit code',
  onVerify,
  onCancel,
  loading = false,
}: VerificationScreenProps) {
  const [error, setError] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30)
  const [verifyLoading, setVerifyLoading] = useState(false)

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) return 30
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Reset timer when code is verified
  const handleComplete = useCallback(async (code: string) => {
    if (verifyLoading || loading) return
    setVerifyLoading(true)
    setError(false)

    try {
      const success = await onVerify(code)
      if (!success) {
        setError(true)
        setTimeout(() => setError(false), 600)
      }
    } catch {
      setError(true)
      setTimeout(() => setError(false), 600)
    } finally {
      setVerifyLoading(false)
    }
  }, [onVerify, verifyLoading, loading])

  const circumference = 2 * Math.PI * 44
  const dashOffset = circumference - (timeLeft / 30) * circumference

  return (
    <div className="h-screen flex items-center justify-center bg-vault-bg">
      <div className="w-full max-w-md mx-4 flex flex-col items-center">
        {/* Shield icon with glow */}
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-2xl bg-vault-accent/10 border border-vault-accent/30 flex items-center justify-center relative z-10">
            <Shield size={36} className="text-vault-accent" />
          </div>
          {/* Glow effect */}
          <div className="absolute inset-0 w-20 h-20 rounded-2xl bg-vault-accent/20 blur-xl" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-vault-text mb-2">{title}</h1>
        <p className="text-sm text-vault-text-secondary mb-8">{subtitle}</p>

        {/* OTP Input */}
        <div className="mb-8">
          <OtpInput
            length={6}
            onComplete={handleComplete}
            error={error}
            disabled={verifyLoading || loading}
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-vault-danger mb-4 animate-fade-in">
            Invalid code. Please try again.
          </p>
        )}

        {/* Timer ring */}
        <div className="relative w-16 h-16 mb-6">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48" cy="48" r="44"
              fill="none"
              stroke="var(--vault-border)"
              strokeWidth="3"
            />
            <circle
              cx="48" cy="48" r="44"
              fill="none"
              stroke={timeLeft <= 5 ? 'var(--vault-danger)' : 'var(--vault-accent)'}
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${
            timeLeft <= 5 ? 'text-vault-danger' : 'text-vault-text'
          }`}>
            {timeLeft}
          </span>
        </div>

        {/* Loading spinner */}
        {(verifyLoading || loading) && (
          <div className="flex items-center gap-2 text-sm text-vault-text-secondary mb-4">
            <div className="w-4 h-4 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
            Verifying...
          </div>
        )}

        {/* Cancel button */}
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={verifyLoading || loading}
            className="text-sm text-vault-text-secondary hover:text-vault-text transition-colors"
          >
            Use a different method
          </button>
        )}
      </div>
    </div>
  )
}
