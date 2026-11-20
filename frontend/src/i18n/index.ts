import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ar from './locales/ar.json'
import en from './locales/en.json'
import fr from './locales/fr.json'

export const LANGUAGES = ['fr', 'en', 'ar'] as const
export type Language = (typeof LANGUAGES)[number]

const RTL: readonly string[] = ['ar']
const STORAGE_KEY = 'lang'

function savedLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY)
  return LANGUAGES.find((l) => l === saved) ?? 'fr'
}

function applyDocumentLanguage(lang: string) {
  document.documentElement.lang = lang
  document.documentElement.dir = RTL.includes(lang) ? 'rtl' : 'ltr'
}

i18n.on('languageChanged', (lang) => {
  applyDocumentLanguage(lang)
  localStorage.setItem(STORAGE_KEY, lang)
})

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en }, ar: { translation: ar } },
  lng: savedLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

applyDocumentLanguage(i18n.language)

export default i18n
