import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '../../lib/utils'

interface OtpInputProps {
  length?: number
  onComplete: (code: string) => void
  error?: boolean
  disabled?: boolean
  autoFocus?: boolean
}

export function OtpInput({ length = 6, onComplete, error = false, disabled = false, autoFocus = true }: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''))
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRefs.current[0]?.focus()
    }
  }, [autoFocus, disabled])

  const focusInput = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(length - 1, index))
    setActiveIndex(clamped)
    inputRefs.current[clamped]?.focus()
    inputRefs.current[clamped]?.select()
  }, [length])

  const handleChange = useCallback((index: number, value: string) => {
    if (disabled) return

    // Handle paste (multiple characters)
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, length).split('')
      const newValues = [...values]
      let filledCount = 0

      digits.forEach((digit, i) => {
        if (index + i < length) {
          newValues[index + i] = digit
          filledCount++
        }
      })

      setValues(newValues)
      const nextIndex = Math.min(index + filledCount, length - 1)
      focusInput(nextIndex)

      if (newValues.every(v => v !== '')) {
        onComplete(newValues.join(''))
      }
      return
    }

    // Single digit
    const digit = value.replace(/\D/g, '')
    const newValues = [...values]
    newValues[index] = digit
    setValues(newValues)

    if (digit && index < length - 1) {
      focusInput(index + 1)
    }

    if (digit && newValues.every(v => v !== '')) {
      onComplete(newValues.join(''))
    }
  }, [values, length, disabled, focusInput, onComplete])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (disabled) return

    if (e.key === 'Backspace') {
      e.preventDefault()
      const newValues = [...values]
      if (values[index]) {
        newValues[index] = ''
        setValues(newValues)
      } else if (index > 0) {
        newValues[index - 1] = ''
        setValues(newValues)
        focusInput(index - 1)
      }
      return
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      focusInput(index - 1)
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault()
      focusInput(index + 1)
    }
  }, [values, length, disabled, focusInput])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return

    const newValues = [...values]
    pasted.slice(0, length).split('').forEach((char, i) => {
      newValues[i] = char
    })
    setValues(newValues)

    const nextIndex = Math.min(pasted.length, length - 1)
    focusInput(nextIndex)

    if (newValues.every(v => v !== '')) {
      onComplete(newValues.join(''))
    }
  }, [values, length, disabled, focusInput, onComplete])

  const handleFocus = useCallback((index: number) => {
    setActiveIndex(index)
    inputRefs.current[index]?.select()
  }, [])

  return (
    <div className="flex items-center gap-3 justify-center">
      {values.map((value, index) => (
        <div key={index} className="relative">
          <input
            ref={(el) => { inputRefs.current[index] = el }}
            type="text"
            inputMode="numeric"
            maxLength={length} // Allow paste of full code
            value={value}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(index)}
            disabled={disabled}
            className={cn(
              'w-14 h-16 rounded-xl text-center text-2xl font-bold',
              'bg-vault-surface border-2 transition-all duration-200',
              'focus:outline-none caret-transparent',
              disabled && 'opacity-50 cursor-not-allowed',
              error
                ? 'border-vault-danger bg-vault-danger/5 animate-shake'
                : activeIndex === index
                  ? 'border-vault-accent shadow-[0_0_20px_rgba(99,102,241,0.25)] bg-vault-accent/5'
                  : value
                    ? 'border-vault-accent/50 bg-vault-accent/5'
                    : 'border-vault-border hover:border-vault-accent/30',
              'text-vault-text'
            )}
          />
          {/* Cursor line when focused and empty */}
          {activeIndex === index && !value && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 bg-vault-accent animate-pulse-subtle rounded-full pointer-events-none" />
          )}
        </div>
      ))}
    </div>
  )
}
