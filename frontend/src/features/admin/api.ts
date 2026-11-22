import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PEOPLE_KEY, type Role } from '@/features/auth/api'
import { api } from '@/lib/api'

export interface AdminUser {
  id: string
  email: string
  display_name: string
  role: Role
  locale: string
  is_active: boolean
  created_at: string
}

export interface Team {
  id: string
  name: string
  member_ids: string[]
}

export interface NewUser {
  email: string
  display_name: string
  password: string
  role: Role
  locale: string
}

export type UserChanges = Partial<Pick<AdminUser, 'display_name' | 'role' | 'is_active'>> & { new_password?: string }

const USERS = ['admin', 'users'] as const
const TEAMS = ['teams'] as const

export function useAdminUsers() {
  return useQuery({ queryKey: USERS, queryFn: () => api<AdminUser[]>('/admin/users') })
}

export function useTeams() {
  return useQuery({ queryKey: TEAMS, queryFn: () => api<Team[]>('/teams') })
}

/** After any change: refresh the admin list, the people panel and the teams. */
function useRefresh() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: USERS })
    void qc.invalidateQueries({ queryKey: PEOPLE_KEY })
    void qc.invalidateQueries({ queryKey: TEAMS })
  }
}

export function useCreateUser() {
  const refresh = useRefresh()
  return useMutation({ mutationFn: (body: NewUser) => api<AdminUser>('/admin/users', { method: 'POST', body }), onSuccess: refresh })
}

export function useUpdateUser() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, ...body }: UserChanges & { id: string }) => api<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh,
  })
}

export function useTeamActions() {
  const refresh = useRefresh()
  const opts = { onSuccess: refresh }
  return {
    create: useMutation({ mutationFn: (name: string) => api<Team>('/admin/teams', { method: 'POST', body: { name } }), ...opts }),
    rename: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api<Team>(`/admin/teams/${id}`, { method: 'PATCH', body: { name } }), ...opts }),
    remove: useMutation({ mutationFn: (id: string) => api<void>(`/admin/teams/${id}`, { method: 'DELETE' }), ...opts }),
    addMember: useMutation({ mutationFn: ({ id, userId }: { id: string; userId: string }) => api<void>(`/admin/teams/${id}/members`, { method: 'POST', body: { user_id: userId } }), ...opts }),
    removeMember: useMutation({ mutationFn: ({ id, userId }: { id: string; userId: string }) => api<void>(`/admin/teams/${id}/members/${userId}`, { method: 'DELETE' }), ...opts }),
  }
}

/** A strong random password the admin can hand over (the user changes it after signing in). */
export function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
