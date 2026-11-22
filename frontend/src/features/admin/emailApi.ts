import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError, csrfToken } from '@/lib/api'

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

export const EMAIL_KINDS = ['task', 'mention', 'message', 'reminder', 'approval', 'event', 'file', 'report', 'digest'] as const
export type EmailKind = (typeof EMAIL_KINDS)[number]
export type Lang = 'fr' | 'en' | 'ar'

export interface Branding {
  name: string
  color: string
  footer: string
}
export interface BrandingOut extends Branding {
  has_logo: boolean
}
export interface EmailText {
  subject: string
  intro: string
  html?: string // the admin's own HTML for the whole email; empty: built-in design
}
export type Texts = Partial<Record<string, Partial<Record<Lang, EmailText>>>>
export interface TextsOut {
  defaults: Record<string, Record<Lang, EmailText>>
  overrides: Texts
  starter_html: string
  variables: string[]
}
export interface Preview {
  subject: string
  html: string
  text: string
}

const BRANDING = ['admin', 'branding'] as const
const TEXTS = ['admin', 'email-texts'] as const

export function useBranding() {
  return useQuery({ queryKey: BRANDING, queryFn: () => api<BrandingOut>('/admin/email/branding') })
}

export function useSaveBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Branding) => api<BrandingOut>('/admin/email/branding', { method: 'PUT', body }),
    onSuccess: (data) => qc.setQueryData(BRANDING, data),
  })
}

export function useLogo() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: BRANDING })
  return {
    upload: useMutation({
      mutationFn: async (file: File) => {
        const res = await fetch('/api/v1/admin/email/logo', {
          method: 'PUT',
          body: file,
          credentials: 'include',
          headers: { 'X-CSRF-Token': await csrfToken(), 'Content-Type': file.type || 'application/octet-stream' },
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new ApiError(res.status, data?.error?.code ?? 'failed', data?.error?.message ?? '')
        }
      },
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: () => api<void>('/admin/email/logo', { method: 'DELETE' }), onSuccess: refresh }),
  }
}

export function useTexts() {
  return useQuery({ queryKey: TEXTS, queryFn: () => api<TextsOut>('/admin/email/texts') })
}

export function useSaveTexts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Texts) => api<TextsOut>('/admin/email/texts', { method: 'PUT', body }),
    onSuccess: (data) => qc.setQueryData(TEXTS, data),
  })
}

export function usePreview() {
  return useMutation({
    mutationFn: (body: { kind: EmailKind; lang: Lang; branding: Branding; texts: Texts }) =>
      api<Preview>('/admin/email/preview', { method: 'POST', body }),
  })
}

export function useTestKind() {
  return useMutation({
    mutationFn: (body: { to: string; kind: EmailKind; lang: Lang }) => api<void>('/admin/email/test', { method: 'POST', body }),
  })
}
