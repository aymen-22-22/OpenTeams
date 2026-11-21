import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useTeams } from '@/features/ai/api'
import type { Person, User } from '@/features/auth/api'
import { cn, textDirection } from '@/lib/utils'

import { useDeleteMeeting, useEvents, useNewFeedUrl, type CalendarEvent, type CalendarFilter, type EventType } from './api'
import { addDays, dayKey, eventDayKeys, shift, startOfDay, visibleRange, type CalendarMode } from './dates'
import { MeetingForm } from './MeetingForm'

export const EVENT_COLOR: Record<EventType, string> = {
  meeting: 'bg-accent text-accent-foreground',
  day_off: 'bg-amber-200 text-amber-950',
  milestone: 'bg-indigo-200 text-indigo-950',
  project_finished: 'bg-green-200 text-green-950',
  task_due: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
  task_finished: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100',
}

function Chip({ event, onOpen }: { event: CalendarEvent; onOpen: (e: CalendarEvent) => void }) {
  const { i18n } = useTranslation()
  const time = event.all_day ? '' : new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(event.starts_at))
  return (
    // Direction follows the title, not the (localized) time, so long titles are cut at their end.
    <button type="button" onClick={() => onOpen(event)} title={event.title} dir={textDirection(event.title)}
      className={cn('w-full truncate rounded px-1.5 py-0.5 text-start text-xs', EVENT_COLOR[event.type])}>
      {time && <><bdi>{time}</bdi>{' '}</>}{event.title}
    </button>
  )
}

function EventDetails({ event, me, people, onClose, onEdit, onOpenTask, onOpenProject, onRemind }: {
  event: CalendarEvent; me: User; people: Map<string, Person>; onClose: () => void
  onEdit: () => void; onOpenTask: (id: string) => void; onOpenProject: (id: string) => void; onRemind: (e: CalendarEvent) => void
}) {
  const { t, i18n } = useTranslation()
  const remove = useDeleteMeeting()
  const fmt = new Intl.DateTimeFormat(i18n.language, event.all_day ? { dateStyle: 'full' } : { dateStyle: 'full', timeStyle: 'short' })
  const when = event.all_day ? fmt.format(new Date(`${event.starts_at.slice(0, 10)}T12:00`)) : fmt.format(new Date(event.starts_at))
  const mine = event.type === 'meeting' && event.creator_id === me.id

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="event-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-lg bg-background p-5 shadow-xl">
        <span className={cn('self-start rounded px-2 py-0.5 text-xs', EVENT_COLOR[event.type])}>{t(`calendar.types.${event.type}`)}</span>
        <h2 id="event-title" dir="auto" className="text-lg font-semibold">{event.title}</h2>
        <p className="text-sm">{when}</p>
        {event.user_ids.length > 0 && (
          <p className="text-sm text-muted-foreground">{event.user_ids.map((id) => people.get(id)?.display_name ?? '?').join(', ')}</p>
        )}
        {event.description && <p dir="auto" className="whitespace-pre-wrap text-sm">{event.description}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {event.project_id && <Button variant="outline" onClick={() => onOpenProject(event.project_id!)}>{t('calendar.openProject')}</Button>}
          {event.task_id && <Button variant="outline" onClick={() => onOpenTask(event.task_id!)}>{t('calendar.openTask')}</Button>}
          {event.type === 'meeting' && <Button variant="outline" onClick={() => onRemind(event)}>{t('reminders.remindMe')}</Button>}
          {mine && <Button variant="outline" onClick={onEdit}>{t('chat.edit')}</Button>}
          {mine && <Button variant="ghost" onClick={() => remove.mutate(event.id, { onSuccess: onClose })}>{t('chat.delete')}</Button>}
          <Button onClick={onClose}>{t('calendar.close')}</Button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  me: User
  people: Map<string, Person>
  onOpenTask: (taskId: string) => void
  onOpenProject: (projectId: string) => void
  onRemind: (event: CalendarEvent) => void
}

export function CalendarView({ me, people, onOpenTask, onOpenProject, onRemind }: Props) {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<CalendarMode>('month')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [filter, setFilter] = useState<CalendarFilter>({ kind: 'me' })
  const [open, setOpen] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<{ event?: CalendarEvent; date?: Date } | null>(null)
  const feed = useNewFeedUrl()
  const teams = useTeams().data ?? []
  const [start, end] = visibleRange(anchor, mode)
  const events = useEvents(start, end, filter, me.id).data ?? []
  const others = [...people.values()].filter((p) => p.id !== me.id)

  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) for (const key of eventDayKeys(e)) byDay.set(key, [...(byDay.get(key) ?? []), e])
  const days = Array.from({ length: Math.round((end.getTime() - start.getTime()) / 86_400_000) }, (_, i) => addDays(start, i))
  const today = dayKey(new Date())
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(addDays(start, i)))
  const title = new Intl.DateTimeFormat(i18n.language, mode === 'month' ? { month: 'long', year: 'numeric' } : { dateStyle: 'long' }).format(anchor)
  const filterValue = filter.kind === 'me' || filter.kind === 'all' ? filter.kind : `${filter.kind}:${filter.id}`

  return (
    <section aria-label={t('calendar.title')} className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="me-2 text-lg font-semibold">{t('calendar.title')}</h2>
        <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>{t('calendar.today')}</Button>
        <Button variant="ghost" aria-label={t('calendar.previous')} onClick={() => setAnchor(shift(anchor, mode, -1))}>
          <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
        </Button>
        <Button variant="ghost" aria-label={t('calendar.next')} onClick={() => setAnchor(shift(anchor, mode, 1))}>
          <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
        </Button>
        <span className="font-medium capitalize">{title}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <select aria-label={t('calendar.view')} value={mode} onChange={(e) => setMode(e.target.value as CalendarMode)}
            className="min-h-11 rounded-md border border-border bg-background px-2">
            {(['month', 'week', 'day'] as const).map((m) => <option key={m} value={m}>{t(`calendar.modes.${m}`)}</option>)}
          </select>
          <select aria-label={t('calendar.whose')} value={filterValue} className="min-h-11 rounded-md border border-border bg-background px-2"
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':')
              setFilter(kind === 'user' || kind === 'team' ? { kind, id } : { kind: kind as 'me' | 'all' })
            }}>
            <option value="me">{t('calendar.mine')}</option>
            <option value="all">{t('calendar.everything')}</option>
            {others.map((p) => <option key={p.id} value={`user:${p.id}`}>{p.display_name}</option>)}
            {teams.map((team) => <option key={team.id} value={`team:${team.id}`}>{t('calendar.team', { name: team.name })}</option>)}
          </select>
          <Button onClick={() => setForm({ date: anchor })}>{t('calendar.newMeeting')}</Button>
          <Button variant="outline" onClick={() => feed.mutate()}>{t('calendar.subscribe')}</Button>
        </div>
      </header>

      {feed.data && (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-muted p-3 text-sm">
          <span>{t('calendar.feedHint')}</span>
          <input readOnly value={feed.data.url} aria-label={t('calendar.feedUrl')} dir="ltr"
            onFocus={(e) => e.target.select()} className="min-h-11 rounded-md border border-border bg-background px-2 font-mono text-xs" />
        </div>
      )}

      {mode === 'month' ? (
        <div role="grid" aria-label={title} className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border">
          {weekdays.map((w) => <div key={w} role="columnheader" className="bg-muted p-1 text-center text-xs font-semibold">{w}</div>)}
          {days.map((d) => {
            const key = dayKey(d)
            const list = byDay.get(key) ?? []
            return (
              <div key={key} role="gridcell" aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(d)}
                className={cn('flex min-h-24 flex-col gap-0.5 bg-background p-1', d.getMonth() !== anchor.getMonth() && 'opacity-50')}>
                <button type="button" onClick={() => { setAnchor(d); setMode('day') }}
                  className={cn('self-start rounded-full px-1.5 text-xs', key === today && 'bg-accent font-semibold text-accent-foreground')}>
                  {d.getDate()}
                </button>
                {list.slice(0, 3).map((e) => <Chip key={e.id} event={e} onOpen={setOpen} />)}
                {list.length > 3 && <span className="text-xs text-muted-foreground">{t('calendar.more', { count: list.length - 3 })}</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className={cn('grid gap-3', mode === 'week' && 'md:grid-cols-7')}>
          {days.map((d) => {
            const key = dayKey(d)
            const list = byDay.get(key) ?? []
            return (
              <section key={key} aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(d)}
                className="flex flex-col gap-1 rounded-md border border-border p-2">
                <h3 className={cn('text-sm font-semibold', key === today && 'text-accent')}>
                  {new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' }).format(d)}
                </h3>
                {list.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                {list.map((e) => <Chip key={e.id} event={e} onOpen={setOpen} />)}
              </section>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs" aria-label={t('calendar.legend')}>
        {(Object.keys(EVENT_COLOR) as EventType[]).map((type) => (
          <span key={type} className={cn('rounded px-2 py-0.5', EVENT_COLOR[type])}>{t(`calendar.types.${type}`)}</span>
        ))}
      </div>

      {open && (
        <EventDetails event={open} me={me} people={people} onClose={() => setOpen(null)}
          onEdit={() => { setForm({ event: open }); setOpen(null) }}
          onOpenTask={(id) => { setOpen(null); onOpenTask(id) }}
          onOpenProject={(id) => { setOpen(null); onOpenProject(id) }}
          onRemind={(e) => { setOpen(null); onRemind(e) }} />
      )}
      {form && <MeetingForm people={others} event={form.event} date={form.date} onDone={() => setForm(null)} />}
    </section>
  )
}
