import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { useLogin } from './api'

export function LoginPage() {
  const { t } = useTranslation()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password })
  }

  const error = login.error
  const errorKey =
    error instanceof ApiError && error.status === 429
      ? 'login.rateLimited'
      : error instanceof ApiError && error.status === 401
        ? 'login.invalid'
        : 'login.failed'

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border p-6">
        <h1 className="text-xl font-semibold text-accent">{t('app.name')}</h1>
        <p className="text-sm text-muted-foreground">{t('login.title')}</p>
        <label className="flex flex-col gap-1 text-sm">
          {t('login.email')}
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-md border border-border bg-background px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('login.password')}
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-md border border-border bg-background px-3" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{t(errorKey)}</p>}
        <Button type="submit" disabled={login.isPending}>{t('login.submit')}</Button>
      </form>
    </main>
  )
}
