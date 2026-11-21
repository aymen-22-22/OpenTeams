import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export const NOTIFICATION_TYPES = ['message', 'reminder', 'file', 'task', 'approval', 'report', 'event', 'mention'] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export type TargetType = 'message' | 'file' | 'task' | 'event'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  link: string
  read_at: string | null
  created_at: string
}

export interface Preference {
  type: NotificationType
  in_app: boolean
  email: boolean
}

export interface Reminder {
  id: string
  title: string
  remind_at: string
  recurrence: Recurrence
  target_type: TargetType | null
  target_id: string | null
  active: boolean
}

export interface ReminderInput {
  title: string
  remind_at: string
  recurrence: Recurrence
  target_type?: TargetType | null
  target_id?: string | null
}

export const notificationKeys = {
  list: ['notifications'] as const,
  prefs: ['notifications', 'prefs'] as const,
  reminders: ['reminders'] as const,
}

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: () => api<{ items: AppNotification[]; unread: number }>('/notifications'),
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string | 'all') =>
      api<void>(id === 'all' ? '/notifications/read-all' : `/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.list }),
  })
}

export function usePreferences() {
  return useQuery({ queryKey: notificationKeys.prefs, queryFn: () => api<Preference[]>('/notifications/preferences') })
}

export function useSavePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prefs: Preference[]) => api<Preference[]>('/notifications/preferences', { method: 'PUT', body: prefs }),
    onSuccess: (prefs) => qc.setQueryData(notificationKeys.prefs, prefs),
  })
}

export function useReminders() {
  return useQuery({ queryKey: notificationKeys.reminders, queryFn: () => api<Reminder[]>('/reminders') })
}

export function useCreateReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReminderInput) => api<Reminder>('/reminders', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.reminders }),
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/reminders/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.reminders }),
  })
}
