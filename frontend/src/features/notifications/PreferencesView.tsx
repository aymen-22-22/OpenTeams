import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { usePreferences, useSavePreferences, type Preference } from './api'

function PreferencesForm({ initial }: { initial: Preference[] }) {
  const { t } = useTranslation()
  const save = useSavePreferences()
  const [prefs, setPrefs] = useState(initial)
  const set = (type: string, patch: Partial<Preference>) =>
    setPrefs((list) => list.map((p) => (p.type === type ? { ...p, ...patch } : p)))

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-2 text-start font-medium">{t('notifications.type')}</th>
            <th className="py-2 font-medium">{t('notifications.inApp')}</th>
            <th className="py-2 font-medium">{t('notifications.email')}</th>
          </tr>
        </thead>
        <tbody>
          {prefs.map((p) => (
            <tr key={p.type} className="border-t border-border">
              <td className="py-2">{t(`notifications.types.${p.type}`)}</td>
              <td className="text-center">
                <input type="checkbox" className="size-5" checked={p.in_app} onChange={(e) => set(p.type, { in_app: e.target.checked })}
                  aria-label={`${t(`notifications.types.${p.type}`)} — ${t('notifications.inApp')}`} />
              </td>
              <td className="text-center">
                <input type="checkbox" className="size-5" checked={p.email} onChange={(e) => set(p.type, { email: e.target.checked })}
                  aria-label={`${t(`notifications.types.${p.type}`)} — ${t('notifications.email')}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {save.isSuccess && <p role="status" className="text-sm text-accent">{t('ai.settings.saved')}</p>}
      <Button className="self-start" onClick={() => save.mutate(prefs)} disabled={save.isPending}>{t('chat.save')}</Button>
    </div>
  )
}

export function PreferencesView() {
  const { t } = useTranslation()
  const prefs = usePreferences().data
  return (
    <section aria-label={t('notifications.preferences')} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-5">
      <h2 className="page-title">{t('notifications.preferences')}</h2>
      {prefs && <PreferencesForm initial={prefs} />}
      </div>
    </section>
  )
}
