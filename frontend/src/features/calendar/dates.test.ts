import { addDays, dayKey, eventDayKey, eventDayKeys, shift, startOfWeek, visibleRange } from './dates'

test('weeks start on Monday', () => {
  expect(dayKey(startOfWeek(new Date(2026, 0, 7)))).toBe('2026-01-05') // Wednesday -> Monday
  expect(dayKey(startOfWeek(new Date(2026, 0, 11)))).toBe('2026-01-05') // Sunday -> Monday
})

test('month view shows 6 full weeks starting on a Monday', () => {
  const [start, end] = visibleRange(new Date(2026, 0, 20), 'month')
  expect(dayKey(start)).toBe('2025-12-29')
  expect(dayKey(end)).toBe(dayKey(addDays(start, 42)))
})

test('navigation moves by the current unit', () => {
  expect(dayKey(shift(new Date(2026, 0, 31), 'month', 1))).toBe('2026-02-01')
  expect(dayKey(shift(new Date(2026, 0, 7), 'week', -1))).toBe('2025-12-31')
})

test('all-day events keep their calendar date in any timezone', () => {
  expect(eventDayKey({ starts_at: '2026-01-15T00:00:00Z', all_day: true })).toBe('2026-01-15')
})

test('multi-day all-day events cover each of their days', () => {
  const leave = { starts_at: '2026-02-09T00:00:00Z', ends_at: '2026-02-11T00:00:00Z', all_day: true }
  expect(eventDayKeys(leave)).toEqual(['2026-02-09', '2026-02-10', '2026-02-11'])
  const meeting = { starts_at: '2026-02-09T09:00:00Z', ends_at: '2026-02-09T10:00:00Z', all_day: false }
  expect(eventDayKeys(meeting)).toHaveLength(1)
})
