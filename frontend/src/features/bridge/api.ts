import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from '@/lib/api'

export interface EmailAddress {
  address: string | null
}

const key = (conversationId: string) => ['email-address', conversationId]

/** null when the email bridge is not configured on the server (the section is then hidden). */
export function useEmailAddress(conversationId: string | undefined) {
  return useQuery({
    queryKey: key(conversationId ?? ''),
    queryFn: async () => {
      try {
        return await api<EmailAddress>(`/conversations/${conversationId}/email-address`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    enabled: Boolean(conversationId),
    staleTime: 5 * 60_000,
  })
}

/** Create the address, or replace it (the old one stops working). */
export function useNewEmailAddress(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<EmailAddress>(`/conversations/${conversationId}/email-address`, { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(key(conversationId), data),
  })
}
