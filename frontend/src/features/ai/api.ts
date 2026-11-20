import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type Provider = 'anthropic' | 'openai' | 'qwen' | 'ollama'
export type Audience = 'owner_only' | 'everyone' | 'people' | 'teams'
export type Length = 'short' | 'medium' | 'long'

export interface AIProfile {
  active: boolean
  provider: Provider
  model: string
  has_api_key: boolean
  system_prompt: string
  default_prompt: string
  language: string
  tone: string
  length: Length
  hours_start: number | null
  hours_end: number | null
  audience: Audience
  allowed_user_ids: string[]
  allowed_team_ids: string[]
  share_tasks: boolean
  ready: boolean
}

export type AIProfileInput = Omit<AIProfile, 'has_api_key' | 'ready'> & {
  api_key?: string | null
  clear_api_key?: boolean
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider: string | null
  model: string | null
  created_at: string
}

export interface Thread {
  owner_id: string
  available: boolean
  messages: AIMessage[]
}

export interface Team {
  id: string
  name: string
  member_ids: string[]
}

const keys = {
  profile: ['ai', 'profile'] as const,
  thread: (ownerId: string) => ['ai', 'thread', ownerId] as const,
  log: ['ai', 'log'] as const,
}

export function useAIProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => api<AIProfile>('/ai/profile') })
}

export function useSaveAIProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AIProfileInput) => api<AIProfile>('/ai/profile', { method: 'PUT', body: input }),
    onSuccess: (profile) => {
      qc.setQueryData(keys.profile, profile)
      void qc.invalidateQueries({ queryKey: ['people'] })
    },
  })
}

export function useThread(ownerId: string) {
  return useQuery({ queryKey: keys.thread(ownerId), queryFn: () => api<Thread>(`/ai/${ownerId}/thread`), retry: false })
}

export function useAsk(ownerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => api<AIMessage>(`/ai/${ownerId}/messages`, { method: 'POST', body: { content } }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.thread(ownerId) }),
  })
}

export function useAILog() {
  return useQuery({ queryKey: keys.log, queryFn: () => api<{ caller_id: string; messages: AIMessage[] }[]>('/ai/log') })
}

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: () => api<Team[]>('/teams') })
}
