import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type EventType = 'day_off' | 'meeting' | 'milestone' | 'project_finished' | 'task_due' | 'task_finished'

export interface CalendarEvent {
  id: string
  type: EventType
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  user_ids: string[]
  task_id: string | null
  project_id?: string | null
  creator_id: string | null
  description: string
  conversation_id: string | null
}

export interface MeetingInput {
  title: string
  description: string
  starts_at: string
  ends_at: string
  all_day: boolean
  attendee_ids: string[]
  conversation_id?: string | null
}

/** Whose calendar to show: mine, everything I can see, one person, or one team. */
export type CalendarFilter = { kind: 'me' } | { kind: 'all' } | { kind: 'user'; id: string } | { kind: 'team'; id: string }

function filterParams(filter: CalendarFilter, meId: string): string {
  if (filter.kind === 'me') return `&user_id=${meId}`
  if (filter.kind === 'user') return `&user_id=${filter.id}`
  if (filter.kind === 'team') return `&team_id=${filter.id}`
  return ''
}

export function useEvents(start: Date, end: Date, filter: CalendarFilter, meId: string) {
  const params = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}${filterParams(filter, meId)}`
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: () => api<CalendarEvent[]>(`/calendar/events?${params}`),
  })
}

export function useSaveMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: MeetingInput }) =>
      api<CalendarEvent>(id ? `/calendar/events/${id}` : '/calendar/events', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  })
}

export function useDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/calendar/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  })
}

export function useNewFeedUrl() {
  return useMutation({ mutationFn: () => api<{ url: string }>('/calendar/feed', { method: 'POST' }) })
}
