import { useState, useEffect } from 'react'
import { invoke } from '../../lib/ipc'
import { useToastStore } from '../ui/Toast'
import { useI18n } from '../../i18n'
import { Copy, RefreshCw } from 'lucide-react'
import { calculateStrength } from '../../lib/passwordStrength'
import type { PasswordOptions } from '@shared/types'

type GeneratorMode = 'password' | 'passphrase' | 'username'

export function PasswordGenerator({ onUsePassword }: { onUsePassword?: (pwd: string) => void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<GeneratorMode>('password')
  const [options, setOptions] = useState<PasswordOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  })
  const [passphraseWords, setPassphraseWords] = useState(4)
  const [password, setPassword] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  const generate = async () => {
    let pwd: string
    if (mode === 'passphrase') {
      pwd = await invoke('password:generate-passphrase', passphraseWords)
    } else if (mode === 'username') {
      pwd = await invoke('password:generate-username')
    } else {
      pwd = await invoke('password:generate', options)
    }
    setPassword(pwd)
  }

  useEffect(() => {
    generate()
  }, [mode, options, passphraseWords])

  const strength = calculateStrength(password)

  const handleCopy = async () => {
    await invoke('clipboard:copy', password, 30000)
    addToast(t('copied_toast'), 'success')
  }

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-vault-bg rounded-lg">
        {([
          { key: 'password' as GeneratorMode, label: t('password_tab') },
          { key: 'passphrase' as GeneratorMode, label: t('passphrase_tab') },
          { key: 'username' as GeneratorMode, label: t('username_tab') },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === key
                ? 'bg-vault-surface text-vault-text shadow-sm'
                : 'text-vault-text-secondary hover:text-vault-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Generated password display */}
      <div className="relative">
        <div className="flex items-center h-12 px-4 rounded-xl bg-vault-bg border border-vault-border">
          <span className="flex-1 font-mono text-sm text-vault-text break-all leading-relaxed">
            {password}
          </span>
          <div className="flex items-center gap-1 ml-3">
            <button
              onClick={generate}
              className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-text hover:bg-vault-surface-hover transition-colors"
              title={t('regenerate')}
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg text-vault-text-secondary hover:text-vault-accent hover:bg-vault-accent/10 transition-colors"
              title={t('copy')}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Strength meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-vault-text-secondary">{t('strength')}</span>
          <span className="text-xs font-medium" style={{ color: strength.color }}>{strength.label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-vault-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(strength.score / 4) * 100}%`,
              backgroundColor: strength.color,
            }}
          />
        </div>
      </div>

      {/* Password options (only in password mode) */}
      {mode === 'password' && (
        <>
          {/* Length slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-vault-text-secondary">{t('length')}</span>
              <span className="text-xs font-medium text-vault-text">{options.length}</span>
            </div>
            <input
              type="range"
              min="8"
              max="64"
              value={options.length}
              onChange={(e) => setOptions({ ...options, length: parseInt(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-vault-accent"
              style={{
                background: `linear-gradient(to right, var(--vault-accent) ${((options.length - 8) / 56) * 100}%, var(--vault-border) ${((options.length - 8) / 56) * 100}%)`,
              }}
            />
            <div className="flex justify-between text-[10px] text-vault-text-secondary">
              <span>8</span>
              <span>64</span>
            </div>
          </div>

          {/* Character options */}
          <div className="space-y-2">
            <span className="text-xs text-vault-text-secondary">{t('character_types')}</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'uppercase' as const, label: 'A-Z', desc: t('uppercase') },
                { key: 'lowercase' as const, label: 'a-z', desc: t('lowercase') },
                { key: 'numbers' as const, label: '0-9', desc: t('numbers') },
                { key: 'symbols' as const, label: '!@#', desc: t('symbols') },
              ].map(({ key, label, desc }) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    options[key]
                      ? 'bg-vault-accent/10 border-vault-accent/30'
                      : 'bg-vault-surface border-vault-border hover:border-vault-accent/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
                    className="sr-only"
                  />
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                options[key] ? 'bg-vault-accent border-vault-accent' : 'border-vault-border'
              }`}>
                {options[key] && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-vault-text">{label}</div>
                <div className="text-[10px] text-vault-text-secondary">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
        </>
      )}

      {/* Passphrase options (only in passphrase mode) */}
      {mode === 'passphrase' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-vault-text-secondary">{t('number_of_words')}</span>
            <span className="text-xs font-medium text-vault-text">{passphraseWords}</span>
          </div>
          <input
            type="range"
            min="3"
            max="8"
            value={passphraseWords}
            onChange={(e) => setPassphraseWords(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-vault-accent"
            style={{
              background: `linear-gradient(to right, var(--vault-accent) ${((passphraseWords - 3) / 5) * 100}%, var(--vault-border) ${((passphraseWords - 3) / 5) * 100}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-vault-text-secondary">
            <span>3</span>
            <span>8</span>
          </div>
        </div>
      )}

      {/* Use password button */}
      {onUsePassword && (
        <button
          onClick={() => onUsePassword(password)}
          className="w-full py-2.5 bg-vault-accent text-white rounded-lg hover:bg-vault-accent-hover transition-colors text-sm font-medium"
        >
          {t('use_password')}
        </button>
      )}
    </div>
  )
}
