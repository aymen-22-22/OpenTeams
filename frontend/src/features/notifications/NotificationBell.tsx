import { AtSign, Bell, BellOff, CalendarDays, CheckSquare, ClipboardCheck, FileText, MessageSquare, ScrollText, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

import { useMarkRead, useNotifications, type AppNotification } from './api'

const TYPE_ICON: Record<string, LucideIcon> = {
  message: MessageSquare, mention: AtSign, reminder: Bell, file: FileText, task: CheckSquare,
  approval: ClipboardCheck, report: ScrollText, event: CalendarDays,
}

/** "à l'instant", "il y a 5 min", "hier"… in the user's language. */
function timeAgo(iso: string, lang: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'minute')
}

export function NotificationBell({ onNavigate }: { onNavigate: (link: string) => void }) {
  const { t, i18n } = useTranslation()
  const data = useNotifications().data
  const markRead = useMarkRead()
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const unread = data?.unread ?? 0
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on Escape or on a click outside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const openItem = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id)
    setOpen(false)
    onNavigate(n.link)
  }

  return (
    <div ref={rootRef} className="relative">
      <Button variant="ghost" aria-label={t('notifications.title', { count: unread })} aria-expanded={open}
        onClick={() => { setNow(Date.now()); setOpen((o) => !o) }} size="icon" className="relative">
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          // The number is drawn by CSS: the button's label already says it, so it is not page text.
          <span aria-hidden data-count={unread > 99 ? '99+' : unread}
            className="absolute end-1.5 top-1.5 min-w-[18px] animate-pop rounded-full bg-danger px-1 text-center text-[10px] leading-[18px] font-semibold text-white ring-2 ring-background after:content-[attr(data-count)] dark:text-black" />
        )}
      </Button>
      {open && (
        <div role="dialog" aria-label={t('notifications.center')}
          className="absolute end-0 top-full z-30 mt-2 flex w-96 max-w-[92vw] origin-top animate-pop flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-1">
            <span className="text-sm font-semibold">{t('notifications.center')}</span>
            {unread > 0 && (
              <button type="button" className="min-h-11 text-sm text-accent" onClick={() => markRead.mutate('all')}>
                {t('notifications.readAll')}
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 && (
              <li><EmptyState icon={BellOff} title={t('notifications.empty')} className="py-8" /></li>
            )}
            {data?.items.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Bell
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)}
                    className={cn('flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-start transition-colors hover:bg-muted', !n.read_at && 'bg-accent-soft/40')}>
                    <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', n.type === 'mention' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-accent-soft text-accent-soft-foreground')}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-accent">{t(`notifications.types.${n.type}`)}</span>
                        <span className="text-muted-foreground">{timeAgo(n.created_at, i18n.language, now)}</span>
                      </span>
                      <span dir="auto" className="w-full truncate text-sm font-medium">{n.title}</span>
                      {n.body && <span dir="auto" className="line-clamp-2 w-full text-xs text-muted-foreground">{n.body}</span>}
                    </span>
                    {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="min-h-11 bg-sidebar text-sm font-medium text-accent transition-colors hover:bg-muted"
            onClick={() => { setOpen(false); onNavigate('/preferences') }}>
            {t('notifications.preferences')}
          </button>
        </div>
      )}
    </div>
  )
}
