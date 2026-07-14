import { create } from 'zustand'
import en from './locales/en'
import ru from './locales/ru'

type Locale = 'en' | 'ru'
type TranslationKeys = keyof typeof en

const locales: Record<Locale, typeof en> = { en, ru }

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string
}

function translate(locale: Locale, key: TranslationKeys, params?: Record<string, string | number>): string {
  let text = locales[locale][key] || locales.en[key] || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: (localStorage.getItem('locale') as Locale) || 'en',
  setLocale: (locale) => {
    localStorage.setItem('locale', locale)
    set({ locale })
  },
  t: (key, params) => translate(get().locale, key, params),
}))

export type { Locale, TranslationKeys }
