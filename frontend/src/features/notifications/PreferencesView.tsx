import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useMe, useUpdateMe } from '@/features/auth/api'

import { usePreferences, useSavePreferences, type EmailFrequency, type Preference } from './api'

type EmailChoice = 'off' | EmailFrequency
const HOURS = Array.from({ length: 24 }, (_, h) => h)

function PreferencesForm({ initial, initialHour }: { initial: Preference[]; initialHour: number }) {
  const { t, i18n } = useTranslation()
  const save = useSavePreferences()
  const updateMe = useUpdateMe()
  const [prefs, setPrefs] = useState(initial)
  const [hour, setHour] = useState(initialHour)
  const set = (type: string, patch: Partial<Preference>) =>
    setPrefs((list) => list.map((p) => (p.type === type ? { ...p, ...patch } : p)))
  const setEmail = (type: string, choice: EmailChoice) =>
    set(type, choice === 'off' ? { email: false } : { email: true, email_frequency: choice })

  const hourLabel = (h: number) =>
    new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(2000, 0, 1, h))
  const usesDigest = prefs.some((p) => p.email && p.email_frequency === 'daily')

  const submit = async () => {
    await save.mutateAsync(prefs)
    if (hour !== initialHour) await updateMe.mutateAsync({ digest_hour: hour })
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-2 text-start font-medium">{t('notifications.type')}</th>
            <th className="py-2 font-medium">{t('notifications.inApp')}</th>
            <th className="py-2 text-start font-medium">{t('notifications.email')}</th>
          </tr>
        </thead>
        <tbody>
          {prefs.map((p) => {
            const label = t(`notifications.types.${p.type}`)
            return (
              <tr key={p.type} className="border-t border-border">
                <td className="py-2">{label}</td>
                <td className="text-center">
                  <input type="checkbox" className="size-5" checked={p.in_app} onChange={(e) => set(p.type, { in_app: e.target.checked })}
                    aria-label={`${label} — ${t('notifications.inApp')}`} />
                </td>
                <td className="py-1.5">
                  <select className="field w-full" value={p.email ? p.email_frequency : 'off'}
                    onChange={(e) => setEmail(p.type, e.target.value as EmailChoice)}
                    aria-label={`${label} — ${t('notifications.email')}`}>
                    <option value="off">{t('notifications.emailOff')}</option>
                    <option value="instant">{t('notifications.emailInstant')}</option>
                    <option value="daily">{t('notifications.emailDaily')}</option>
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="card flex flex-col gap-2 p-4">
        <label htmlFor="digest-hour" className="text-sm font-medium">{t('notifications.digestHour')}</label>
        <select id="digest-hour" className="field w-40" value={hour} onChange={(e) => setHour(Number(e.target.value))}
          disabled={!usesDigest} aria-describedby="digest-hint">
          {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
        <p id="digest-hint" className="text-[13px] text-muted-foreground">{t('notifications.digestHint')}</p>
      </div>

      {save.isSuccess && !updateMe.isPending && <p role="status" className="text-sm text-accent">{t('ai.settings.saved')}</p>}
      <Button className="self-start" onClick={() => void submit()} disabled={save.isPending || updateMe.isPending}>{t('chat.save')}</Button>
    </div>
  )
}

export function PreferencesView() {
  const { t } = useTranslation()
  const prefs = usePreferences().data
  const me = useMe().data
  return (
    <section aria-label={t('notifications.preferences')} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-5">
        <h2 className="page-title">{t('notifications.preferences')}</h2>
        {prefs && me && <PreferencesForm initial={prefs} initialHour={me.digest_hour ?? 8} />}
      </div>
    </section>
  )
}
