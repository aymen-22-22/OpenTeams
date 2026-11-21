import { Globe, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { User } from '@/features/auth/api'
import type { Message } from '@/features/chat/api'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { SearchBox } from '@/features/search/SearchBox'
import { useTheme } from '@/hooks/useTheme'
import { LANGUAGES } from '@/i18n'

import { AccountMenu } from './AccountMenu'
import { Logo } from './Logo'

const LANGUAGE_NAMES = { fr: 'Français', en: 'English', ar: 'العربية' } as const

interface Props {
  me: User
  onOpenMessage: (m: Message) => void
  onNavigate: (link: string) => void
}

export function TopBar({ me, onOpenMessage, onNavigate }: Props) {
  const { t, i18n } = useTranslation()
  const { theme, toggle } = useTheme()

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <Logo className="me-2 md:hidden" compact />
      <SearchBox onOpen={onOpenMessage} onNavigate={onNavigate} />
      <div className="ms-auto flex items-center gap-0.5">
        <label className="relative hidden items-center sm:flex">
          <Globe className="pointer-events-none absolute start-2.5 size-4 text-muted-foreground" aria-hidden />
          <select aria-label={t('app.language')} value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}
            className="min-h-11 cursor-pointer appearance-none rounded-lg bg-transparent ps-8 pe-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted">
            {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
          </select>
        </label>
        <NotificationBell onNavigate={onNavigate} />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('app.theme')}>
          {theme === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
        </Button>
        <AccountMenu me={me} onNavigate={onNavigate} />
      </div>
    </header>
  )
}
