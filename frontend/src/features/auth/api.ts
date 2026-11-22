import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from '@/lib/api'

export type Role = 'admin' | 'manager' | 'employee'
export type Presence = 'online' | 'away' | 'offline'

export interface User {
  id: string
  email: string
  display_name: string
  locale: string
  role: Role
  digest_hour?: number // local hour of the daily digest email
}

export interface Person {
  id: string
  display_name: string
  role: Role
  presence: Presence
  ai_active: boolean
}

export const ME_KEY = ['me']
export const PEOPLE_KEY = ['people']

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<User | null>('/users/me'),
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  })
}

export function usePeople() {
  return useQuery({ queryKey: PEOPLE_KEY, queryFn: () => api<Person[]>('/users') })
}

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Pick<User, 'display_name' | 'locale' | 'digest_hour'>>) =>
      api<User>('/users/me', { method: 'PATCH', body }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<User>('/auth/login', { method: 'POST', body }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Drop all cached data, then mark the user as signed out so the login page shows.
      qc.removeQueries({ predicate: (q) => q.queryKey !== ME_KEY && q.queryKey[0] !== ME_KEY[0] })
      qc.setQueryData(ME_KEY, null)
    },
  })
}
