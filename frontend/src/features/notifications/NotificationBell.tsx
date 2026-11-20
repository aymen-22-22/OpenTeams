import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useMarkRead, useNotifications, type AppNotification } from './api'

export function NotificationBell({ onNavigate }: { onNavigate: (link: string) => void }) {
  const { t } = useTranslation()
  const data = useNotifications().data
  const markRead = useMarkRead()
  const [open, setOpen] = useState(false)
  const unread = data?.unread ?? 0

  const openItem = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id)
    setOpen(false)
    onNavigate(n.link)
  }

  return (
    <div className="relative">
      <Button variant="ghost" aria-label={t('notifications.title', { count: unread })} aria-expanded={open}
        onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute end-1 top-1 min-w-5 rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>
      {open && (
        <div role="dialog" aria-label={t('notifications.center')}
          className="absolute end-0 top-full z-20 mt-1 flex w-80 max-w-[90vw] flex-col rounded-md border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-semibold">{t('notifications.center')}</span>
            {unread > 0 && (
              <button type="button" className="min-h-11 text-sm text-accent" onClick={() => markRead.mutate('all')}>
                {t('notifications.readAll')}
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 && <li className="p-3 text-sm text-muted-foreground">{t('notifications.empty')}</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)}
                  className={cn('flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-start hover:bg-muted', !n.read_at && 'bg-muted/60')}>
                  <span className="text-xs font-semibold text-accent">{t(`notifications.types.${n.type}`)}</span>
                  <span dir="auto" className="w-full truncate text-sm font-medium">{n.title}</span>
                  {n.body && <span dir="auto" className="w-full truncate text-xs text-muted-foreground">{n.body}</span>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="min-h-11 border-t border-border text-sm text-accent"
            onClick={() => { setOpen(false); onNavigate('/preferences') }}>
            {t('notifications.preferences')}
          </button>
        </div>
      )}
    </div>
  )
}
