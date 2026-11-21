import { BellRing, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { useLogout, type User } from '@/features/auth/api'

/** Avatar button opening a small menu: who I am, preferences, sign out. */
export function AccountMenu({ me, onNavigate }: { me: User; onNavigate: (link: string) => void }) {
  const { t } = useTranslation()
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
          <button type="button" role="menuitem" className={entry} onClick={() => { setOpen(false); onNavigate('/preferences') }}>
            <BellRing className="size-4 text-muted-foreground" aria-hidden />
            {t('notifications.preferences')}
          </button>
          <button type="button" role="menuitem" className={`${entry} text-danger`} onClick={() => logout.mutate()}>
            <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
            {t('app.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
