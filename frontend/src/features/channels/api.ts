import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface Channel {
  id: string
  name: string
  description: string
  is_private: boolean
  created_by: string | null
  member_count: number
  joined: boolean
  can_manage: boolean
}

export interface ChannelInput {
  name: string
  description: string
  is_private: boolean
  member_ids: string[]
}

export function useChannels() {
  return useQuery({ queryKey: ['channels'], queryFn: () => api<Channel[]>('/channels') })
}

function useRefresh() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['channels'] })
    void qc.invalidateQueries({ queryKey: ['conversations'] })
  }
}

export function useCreateChannel() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: ChannelInput) => api<Channel>('/channels', { method: 'POST', body: input }),
    onSuccess: refresh,
  })
}

export function useJoinLeave() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'join' | 'leave' }) =>
      api<Channel>(`/channels/${id}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  })
}
