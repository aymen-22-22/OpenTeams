import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'

import { useSaveMeeting, type CalendarEvent } from './api'
import { dayKey } from './dates'

const field = 'min-h-11 rounded-md border border-border bg-background px-3'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  people: Person[] // other people, for invitations
  event?: CalendarEvent // edit
  date?: Date
  conversationId?: string | null
  onDone: () => void
}

export function MeetingForm({ people, event, date, conversationId, onDone }: Props) {
  const { t } = useTranslation()
  const save = useSaveMeeting()
  const [title, setTitle] = useState(event?.title ?? '')
  const [day, setDay] = useState(event ? dayKey(new Date(event.starts_at)) : dayKey(date ?? new Date()))
  const [from, setFrom] = useState(event ? timeOf(event.starts_at) : '10:00')
  const [to, setTo] = useState(event ? timeOf(event.ends_at) : '11:00')
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [attendees, setAttendees] = useState<string[]>(event?.user_ids ?? [])
  const [description, setDescription] = useState(event?.description ?? '')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const at = (time: string) => new Date(`${day}T${allDay ? '00:00' : time}`).toISOString()
    save.mutate(
      {
        id: event?.id,
        input: {
          title: title.trim(), description, all_day: allDay, attendee_ids: attendees,
          starts_at: at(from), ends_at: allDay ? at('00:00') : at(to),
          conversation_id: event?.conversation_id ?? conversationId ?? null,
        },
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="meeting-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onKeyDown={(e) => e.key === 'Escape' && onDone()}>
      <form onSubmit={onSubmit} className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg bg-background p-5 shadow-xl">
        <h2 id="meeting-title" className="text-lg font-semibold">{event ? t('calendar.editMeeting') : t('calendar.newMeeting')}</h2>
        {conversationId && <p className="text-sm text-muted-foreground">{t('calendar.fromChatHint')}</p>}
        <label className="flex flex-col gap-1 text-sm">
          {t('tasks.title')}
          <input required autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} dir="auto" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('calendar.date')}
          <input type="date" required value={day} onChange={(e) => setDay(e.target.value)} className={field} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          {t('calendar.allDay')}
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">{t('calendar.from')}
              <input type="time" required value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm">{t('calendar.to')}
              <input type="time" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
            </label>
          </div>
        )}
        <fieldset className="flex flex-col rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">{t('calendar.attendees')}</legend>
          {people.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={attendees.includes(p.id)}
                onChange={(e) => setAttendees((a) => (e.target.checked ? [...a, p.id] : a.filter((x) => x !== p.id)))} />
              {p.display_name}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          {t('calendar.description')}
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} py-2`} dir="auto" />
        </label>
        {save.isError && <p role="alert" className="text-sm text-red-600">{t('calendar.saveFailed')}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>{t('chat.cancel')}</Button>
          <Button type="submit" disabled={save.isPending}>{t('chat.save')}</Button>
        </div>
      </form>
    </div>
  )
}
