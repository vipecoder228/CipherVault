import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}', './electron/preload/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: 'var(--vault-bg)',
          surface: 'var(--vault-surface)',
          'surface-hover': 'var(--vault-surface-hover)',
          border: 'var(--vault-border)',
          text: 'var(--vault-text)',
          'text-secondary': 'var(--vault-text-secondary)',
          accent: 'var(--vault-accent)',
          'accent-hover': 'var(--vault-accent-hover)',
          danger: 'var(--vault-danger)',
          success: 'var(--vault-success)',
          warning: 'var(--vault-warning)',
        }
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'shake': 'shake 0.5s ease-in-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
      }
    },
  },
  plugins: [],
}

export default config
