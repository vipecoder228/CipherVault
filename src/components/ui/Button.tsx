import { cn } from '../../lib/utils'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-vault-accent/50 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-vault-accent text-white hover:bg-vault-accent-hover': variant === 'primary',
            'bg-vault-surface border border-vault-border text-vault-text hover:bg-vault-surface-hover': variant === 'secondary',
            'bg-transparent text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover': variant === 'ghost',
            'bg-vault-danger/10 text-vault-danger hover:bg-vault-danger/20': variant === 'danger',
          },
          {
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
