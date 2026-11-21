/** Small date helpers (local time, weeks start on Monday). */

export type CalendarMode = 'month' | 'week' | 'day'

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7))
}

/** Local "YYYY-MM-DD" for a date. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

/** The day an event belongs to: all-day events keep their calendar date, others use local time. */
export function eventDayKey(e: { starts_at: string; all_day: boolean }): string {
  return e.all_day ? e.starts_at.slice(0, 10) : dayKey(new Date(e.starts_at))
}

/** First and last (exclusive) day shown for a mode. Month views show 6 full weeks. */
export function visibleRange(anchor: Date, mode: CalendarMode): [Date, Date] {
  if (mode === 'day') return [startOfDay(anchor), addDays(startOfDay(anchor), 1)]
  if (mode === 'week') return [startOfWeek(anchor), addDays(startOfWeek(anchor), 7)]
  const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  return [first, addDays(first, 42)]
}

export function shift(anchor: Date, mode: CalendarMode, direction: 1 | -1): Date {
  if (mode === 'day') return addDays(anchor, direction)
  if (mode === 'week') return addDays(anchor, 7 * direction)
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
}

/** Every day an event covers: multi-day all-day events (leave) appear on each of their days. */
export function eventDayKeys(e: { starts_at: string; ends_at: string; all_day: boolean }): string[] {
  const first = eventDayKey(e)
  if (!e.all_day) return [first]
  const last = e.ends_at.slice(0, 10)
  const keys = [first]
  for (let d = addDays(new Date(`${first}T12:00`), 1); dayKey(d) <= last && keys.length < 366; d = addDays(d, 1)) {
    keys.push(dayKey(d))
  }
  return keys
}
