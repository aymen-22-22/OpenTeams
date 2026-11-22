import { CheckCircle2, Mail, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { EmailDesign } from './EmailDesign'
import { useEmailSettings, useSaveEmailSettings, useTestEmail, type EmailSettings, type Security } from './emailApi'

const DEFAULT_PORTS: Record<Security, number> = { none: 25, starttls: 587, ssl: 465 }

function SmtpForm({ initial }: { initial: EmailSettings }) {
  const { t } = useTranslation()
  const save = useSaveEmailSettings()
  const [form, setForm] = useState({ host: initial.host, port: initial.port, security: initial.security, user: initial.user, mail_from: initial.mail_from })
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(
      { ...form, password: clearPassword ? '' : password || undefined },
      { onSuccess: () => { setPassword(''); setClearPassword(false) } },
    )
  }
  const field = 'flex flex-col gap-1.5 text-sm font-medium'

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5" aria-labelledby="smtp-title">
      <header className="flex flex-wrap items-center gap-2">
        <Mail className="size-5 text-accent" aria-hidden />
        <h3 id="smtp-title" className="font-semibold">{t('admin.smtp.title')}</h3>
        <Badge tone={initial.source === 'admin' ? 'success' : 'neutral'} className="ms-auto">
          {initial.source === 'admin' ? t('admin.smtp.usingAdmin') : t('admin.smtp.usingEnv', { host: initial.env_host || '—' })}
        </Badge>
      </header>
      <p className="text-[13px] text-muted-foreground">{t('admin.smtp.hint')}</p>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <label className={field}>{t('admin.smtp.host')}
          <input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.example.com" className="field" dir="ltr" maxLength={255} />
        </label>
        <label className={field}>{t('admin.smtp.port')}
          <input type="number" min={1} max={65535} required value={form.port} onChange={(e) => set({ port: Number(e.target.value) })} className="field" dir="ltr" />
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="smtp-security" className="text-sm font-medium">{t('admin.smtp.security')}</label>
        <select id="smtp-security" value={form.security} className="field"
          onChange={(e) => { const security = e.target.value as Security; set({ security, port: DEFAULT_PORTS[security] }) }}>
          {(['starttls', 'ssl', 'none'] as const).map((s) => <option key={s} value={s}>{t(`admin.smtp.securities.${s}`)}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}>{t('admin.smtp.user')}
          <input value={form.user} onChange={(e) => set({ user: e.target.value })} className="field" dir="ltr" maxLength={255} autoComplete="off" />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="smtp-password" className="text-sm font-medium">{t('login.password')}</label>
          <input id="smtp-password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setClearPassword(false) }}
            placeholder={initial.password_set ? t('admin.smtp.passwordKept') : ''} className="field" dir="ltr" maxLength={256}
            autoComplete="new-password" aria-describedby="smtp-password-hint" />
          <span id="smtp-password-hint" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {initial.password_set ? t('admin.smtp.passwordSaved') : t('admin.smtp.passwordNone')}
            {initial.password_set && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
                {t('admin.smtp.clearPassword')}
              </label>
            )}
          </span>
        </div>
      </div>
      <label className={field}>{t('admin.smtp.from')}
        <input value={form.mail_from} onChange={(e) => set({ mail_from: e.target.value })} placeholder="SDG Teams <no-reply@example.com>" className="field" dir="ltr" maxLength={320} />
      </label>
      {save.isSuccess && <p role="status" className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden />{t('ai.settings.saved')}</p>}
      {save.isError && <p role="alert" className="text-sm text-danger">{t(save.error instanceof ApiError && save.error.status === 422 ? 'admin.smtp.invalid' : 'admin.errors.failed')}</p>}
      <Button type="submit" className="self-start" disabled={save.isPending}>{t('chat.save')}</Button>
    </form>
  )
}

function TestEmail({ defaultTo }: { defaultTo: string }) {
  const { t } = useTranslation()
  const test = useTestEmail()
  const [to, setTo] = useState(defaultTo)
  const reason = test.error instanceof ApiError ? test.error.details?.reason : undefined
  return (
    <form className="card flex flex-col gap-3 p-5" aria-labelledby="test-title"
      onSubmit={(e) => { e.preventDefault(); test.mutate(to) }}>
      <h3 id="test-title" className="flex items-center gap-2 font-semibold"><Send className="size-5 text-accent" aria-hidden />{t('admin.smtp.testTitle')}</h3>
      <p className="text-[13px] text-muted-foreground">{t('admin.smtp.testHint')}</p>
      <div className="flex flex-wrap gap-2">
        <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('admin.smtp.testTo')}
          className="field min-w-0 flex-1" dir="ltr" />
        <Button type="submit" variant="outline" disabled={test.isPending}>{test.isPending ? t('admin.smtp.sending') : t('admin.smtp.sendTest')}</Button>
      </div>
      {test.isSuccess && <p role="status" className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden />{t('admin.smtp.testSent', { to })}</p>}
      {test.isError && (
        <p role="alert" className="text-sm text-danger">
          {t(reason === 'auth' ? 'admin.smtp.failedAuth' : reason ? 'admin.smtp.failedConnect' : 'admin.errors.failed')}
          {reason && reason !== 'auth' && <span dir="ltr" className="ms-1 font-mono text-xs">({reason})</span>}
        </p>
      )}
    </form>
  )
}

export function EmailSettingsPanel({ meEmail }: { meEmail: string }) {
  const settings = useEmailSettings().data
  if (!settings) return null
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SmtpForm initial={settings} />
        <TestEmail defaultTo={meEmail} />
      </div>
      <EmailDesign meEmail={meEmail} />
    </div>
  )
}
