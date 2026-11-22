import { BellRing, LogOut, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { useLogout, type User } from '@/features/auth/api'
import { LANGUAGE_NAMES, LANGUAGES } from '@/i18n'

/** Avatar button opening a small menu: who I am, preferences, sign out. */
export function AccountMenu({ me, onNavigate }: { me: User; onNavigate: (link: string) => void }) {
  const { t, i18n } = useTranslation()
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const entry = 'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-start text-sm transition-colors hover:bg-muted'

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full transition-transform hover:scale-105">
        <Avatar name={me.display_name} id={me.id} size="sm" />
        <span className="sr-only">{t('app.account', { name: me.display_name })}</span>
      </button>
      {open && (
        <div role="menu" aria-label={t('app.accountMenu')}
          className="absolute end-0 top-full z-30 mt-2 w-64 origin-top animate-pop rounded-xl border border-border bg-background p-1.5 shadow-lg">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={me.display_name} id={me.id} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{me.display_name}</p>
              <p className="truncate text-xs text-muted-foreground">{me.email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          {me.role === 'admin' && (
            <button type="button" role="menuitem" className={entry} onClick={() => { setOpen(false); onNavigate('/admin') }}>
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
              {t('admin.title')}
            </button>
          )}
          <button type="button" role="menuitem" className={entry} onClick={() => { setOpen(false); onNavigate('/preferences') }}>
            <BellRing className="size-4 text-muted-foreground" aria-hidden />
            {t('notifications.preferences')}
          </button>
          <div role="group" aria-label={t('app.language')} className="flex gap-1 px-1.5 py-1 sm:hidden">
            {LANGUAGES.map((l) => (
              <button key={l} type="button" role="menuitemradio" aria-checked={i18n.language === l} lang={l}
                onClick={() => void i18n.changeLanguage(l)}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors ${i18n.language === l ? 'bg-accent-soft text-accent-soft-foreground' : 'hover:bg-muted'}`}>
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" className={`${entry} text-danger`} onClick={() => logout.mutate()}>
            <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
            {t('app.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
