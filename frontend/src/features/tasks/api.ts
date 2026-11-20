import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Conversation } from '@/features/chat/api'
import { api } from '@/lib/api'

export const STATUSES = ['pending', 'in_progress', 'finished'] as const
export type TaskStatus = (typeof STATUSES)[number]
export type Priority = 'low' | 'normal' | 'high'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  position: number
  due_date: string | null
  overdue: boolean
  finished_at: string | null
  creator_id: string | null
  assignee_id: string | null
  conversation_id: string
  source_message_id: string | null
  created_at: string
}

export interface TaskInput {
  title: string
  description?: string
  assignee_id?: string
  due_date?: string | null
  priority?: Priority
  source_message_id?: string | null
}

export type TaskCounts = Record<TaskStatus, number>

const query = (assigneeId?: string) => (assigneeId ? `?assignee_id=${assigneeId}` : '')

export const taskKeys = {
  all: ['tasks'] as const,
  list: (assigneeId?: string) => ['tasks', 'list', assigneeId ?? 'all'] as const,
  counts: (assigneeId?: string) => ['tasks', 'counts', assigneeId ?? 'all'] as const,
  one: (id: string) => ['tasks', 'one', id] as const,
}

export function useTasks(assigneeId?: string) {
  return useQuery({ queryKey: taskKeys.list(assigneeId), queryFn: () => api<Task[]>(`/tasks${query(assigneeId)}`) })
}

export function useTaskCounts(assigneeId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.counts(assigneeId),
    queryFn: () => api<TaskCounts>(`/tasks/counts${query(assigneeId)}`),
    enabled: Boolean(assigneeId),
  })
}

export function useTask(id: string) {
  return useQuery({ queryKey: taskKeys.one(id), queryFn: () => api<Task>(`/tasks/${id}`) })
}

export function useTaskConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api<Conversation>(`/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskInput) => api<Task>('/tasks', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

export function useMoveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; status: TaskStatus; after_id: string | null }) =>
      api<Task>(`/tasks/${input.id}/move`, { method: 'POST', body: { status: input.status, after_id: input.after_id } }),
    onSettled: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  })
}
