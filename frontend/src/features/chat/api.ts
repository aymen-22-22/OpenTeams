import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface Message {
  id: string
  seq: number
  conversation_id: string
  author_id: string | null
  body: string
  reply_to_id: string | null
  created_at: string
  edited_at: string | null
  deleted: boolean
  via_email?: boolean // posted by the email bridge
}

export interface Conversation {
  id: string
  type: 'direct' | 'task' | 'channel'
  title: string | null
  member_ids: string[]
  last_message: Message | null
  unread_count: number
  last_read_seq: number
}

export interface MessagePage {
  items: Message[]
  next_cursor: number | null
}

export interface Pin {
  message: Message
  pinned_by: string | null
  pinned_at: string
}

export type MessagesData = InfiniteData<MessagePage, number | undefined>

export const keys = {
  conversations: ['conversations'] as const,
  direct: (userId: string) => ['direct', userId] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  pins: (conversationId: string) => ['pins', conversationId] as const,
}

export function useConversations() {
  return useQuery({ queryKey: keys.conversations, queryFn: () => api<Conversation[]>('/conversations') })
}

/** Get-or-create is idempotent on the server, so it is safe to run as a query. */
export function useDirectConversation(userId: string | undefined) {
  return useQuery({
    queryKey: keys.direct(userId ?? ''),
    queryFn: () => api<Conversation>('/conversations/direct', { method: 'POST', body: { user_id: userId } }),
    enabled: Boolean(userId),
    staleTime: Infinity,
  })
}

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: keys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      api<MessagePage>(`/conversations/${conversationId}/messages${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

/** Insert or replace a message in the cached pages (page 0 holds the newest messages). */
export function upsertMessage(data: MessagesData | undefined, message: Message): MessagesData | undefined {
  if (!data) return data
  const exists = data.pages.some((p) => p.items.some((m) => m.id === message.id))
  const pages = exists
    ? data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === message.id ? message : m)) }))
    : data.pages.map((p, i) => (i === 0 ? { ...p, items: [...p.items, message] } : p))
  return { ...data, pages }
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { body: string; reply_to_id?: string | null; key: string }) =>
      api<Message>(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { body: input.body, reply_to_id: input.reply_to_id ?? null },
        headers: { 'Idempotency-Key': input.key },
      }),
    onSuccess: (message) => {
      qc.setQueryData<MessagesData>(keys.messages(conversationId), (d) => upsertMessage(d, message))
    },
  })
}

export function useEditMessage() {
  return useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      api<Message>(`/messages/${input.id}`, { method: 'PATCH', body: { body: input.body } }),
  })
}

export function useDeleteMessage() {
  return useMutation({ mutationFn: (id: string) => api<void>(`/messages/${id}`, { method: 'DELETE' }) })
}

export function usePins(conversationId: string | undefined) {
  return useQuery({
    queryKey: keys.pins(conversationId ?? ''),
    queryFn: () => api<Pin[]>(`/conversations/${conversationId}/pins`),
    enabled: Boolean(conversationId),
  })
}

export function useTogglePin(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) =>
      api<void>(`/messages/${input.id}/pin`, { method: input.pinned ? 'DELETE' : 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pins(conversationId) }),
  })
}

export function useMarkRead(conversationId: string) {
  return useMutation({
    mutationFn: (seq: number) => api<void>(`/conversations/${conversationId}/read`, { method: 'POST', body: { seq } }),
  })
}
