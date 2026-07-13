import { cn } from '../../lib/utils'
import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  showPasswordToggle?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, showPasswordToggle, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    const inputType = showPasswordToggle
      ? showPassword ? 'text' : 'password'
      : type

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-vault-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            className={cn(
              'w-full h-10 px-3 rounded-lg bg-vault-surface border border-vault-border text-vault-text',
              'placeholder:text-vault-text-secondary/50',
              'focus:outline-none focus:ring-2 focus:ring-vault-accent/50 focus:border-vault-accent',
              'transition-colors duration-150',
              error && 'border-vault-danger focus:ring-vault-danger/50',
              showPasswordToggle && 'pr-10',
              className
            )}
            {...props}
          />
          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-text-secondary hover:text-vault-text transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-vault-danger">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
