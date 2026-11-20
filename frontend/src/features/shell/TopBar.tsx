import { LogOut, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useLogout, type User } from '@/features/auth/api'
import { useTheme } from '@/hooks/useTheme'
import { LANGUAGES } from '@/i18n'

const LANGUAGE_NAMES = { fr: 'Français', en: 'English', ar: 'العربية' } as const

export function TopBar({ me }: { me: User }) {
  const { t, i18n } = useTranslation()
  const { theme, toggle } = useTheme()
  const logout = useLogout()

  return (
    <header className="flex items-center gap-2 border-b border-border px-4 py-2">
      <span className="font-semibold text-accent">{t('app.name')}</span>
      <input type="search" aria-label={t('app.search')} placeholder={t('app.search')} className="ms-4 hidden min-h-11 flex-1 rounded-md border border-border bg-background px-3 md:block" />
      <select
        aria-label={t('app.language')}
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="ms-auto min-h-11 rounded-md border border-border bg-background px-2"
      >
        {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
      </select>
      <Button variant="ghost" onClick={toggle} aria-label={t('app.theme')}>
        {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
      </Button>
      <span className="hidden text-sm text-muted-foreground sm:inline">{me.display_name}</span>
      <Button variant="ghost" onClick={() => logout.mutate()} aria-label={t('app.logout')}>
        <LogOut className="size-5 rtl:-scale-x-100" aria-hidden />
      </Button>
    </header>
  )
}
