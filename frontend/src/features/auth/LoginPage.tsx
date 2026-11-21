import { AlertCircle, Check, Globe, Loader2, MessagesSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { useLogin } from './api'

export function LoginPage() {
  const { t, i18n } = useTranslation()
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
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (decorative on small screens: hidden) */}
      <section aria-hidden className="relative hidden overflow-hidden bg-gradient-to-br from-teal-800 via-teal-900 to-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -start-16 size-[28rem] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <MessagesSquare className="size-5" />
          </span>
          {t('app.name')}
        </div>
        <div className="relative my-auto max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">{t('login.tagline')}</h2>
          <p className="mt-4 text-base leading-relaxed text-teal-50/85">{t('login.pitch')}</p>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-teal-50/90">
            {(['f1', 'f2', 'f3'] as const).map((k, i) => (
              <li key={k} className="flex animate-fade-up items-center gap-3" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <span className="flex size-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
                  <Check className="size-3.5" />
                </span>
                {t(`login.${k}`)}
              </li>
            ))}
          </ul>
          {/* Small chat preview */}
          <div className="mt-10 flex flex-col gap-2.5">
            <div className="flex animate-fade-up items-end gap-2" style={{ animationDelay: '450ms' }}>
              <span className="size-7 rounded-full bg-sky-400/80" />
              <span className="rounded-2xl rounded-ss-md bg-white/12 px-3.5 py-2 text-sm ring-1 ring-white/15 backdrop-blur">{t('login.f1')} ✨</span>
            </div>
            <div className="flex animate-fade-up items-end justify-end gap-2" style={{ animationDelay: '600ms' }}>
              <span className="rounded-2xl rounded-se-md bg-teal-400 px-3.5 py-2 text-sm text-teal-950">{t('login.welcome')} 👋</span>
            </div>
          </div>
        </div>
        <p className="relative text-xs text-teal-50/60">© OpenTeams</p>
      </section>

      {/* Form */}
      <section className="relative flex flex-col items-center justify-center px-6 py-12">
        <label className="absolute end-4 top-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Globe className="size-4" aria-hidden />
          <select aria-label={t('app.language')} value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}
            className="min-h-11 cursor-pointer appearance-none rounded-lg bg-transparent px-2 font-medium hover:bg-muted">
            <option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option>
          </select>
        </label>
        <form onSubmit={onSubmit} className="flex w-full max-w-sm animate-fade-up flex-col gap-5">
          <div className="mb-2 flex flex-col gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md lg:hidden">
              <MessagesSquare className="size-6" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">{t('login.welcome')}</h1>
            <p className="text-sm text-muted-foreground">{t('login.title')}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('login.email')}
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
              className="field font-normal" placeholder={t('login.emailPlaceholder')} dir="ltr" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('login.password')}
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="field font-normal" dir="ltr" />
          </label>
          {error && (
            <p role="alert" className="flex animate-fade-in items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {t(errorKey)}
            </p>
          )}
          <Button type="submit" disabled={login.isPending} className="mt-1 h-11">
            {login.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('login.submit')}
          </Button>
        </form>
      </section>
    </main>
  )
}
