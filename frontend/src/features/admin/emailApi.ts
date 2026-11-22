import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type Security = 'none' | 'starttls' | 'ssl'

export interface EmailSettings {
  host: string
  port: number
  security: Security
  user: string
  password_set: boolean
  mail_from: string
  source: 'admin' | 'env'
  env_host: string
}

export interface EmailSettingsInput {
  host: string
  port: number
  security: Security
  user: string
  password?: string | null // undefined/null keeps the saved one, '' clears it
  mail_from: string
}

const KEY = ['admin', 'email'] as const

export function useEmailSettings() {
  return useQuery({ queryKey: KEY, queryFn: () => api<EmailSettings>('/admin/email') })
}

export function useSaveEmailSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: EmailSettingsInput) => api<EmailSettings>('/admin/email', { method: 'PUT', body }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })
}

export function useTestEmail() {
  return useMutation({ mutationFn: (to: string) => api<void>('/admin/email/test', { method: 'POST', body: { to } }) })
}
