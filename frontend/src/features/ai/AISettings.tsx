import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'

import { useSaveAIProfile, useTeams, type AIProfile, type AIProfileInput, type Audience, type Provider } from './api'

const field = 'field'
const PROVIDERS: Provider[] = ['anthropic', 'openai', 'qwen', 'ollama']
const AUDIENCES: Audience[] = ['owner_only', 'everyone', 'people', 'teams']

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}</label>
}

/** The editable part of a profile (server-computed fields removed). */
function toInput(profile: AIProfile): AIProfileInput {
  const input: Partial<AIProfile> = { ...profile }
  delete input.has_api_key
  delete input.ready
  return input as AIProfileInput
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export function AISettings({ profile, people }: { profile: AIProfile; people: Person[] }) {
  const { t } = useTranslation()
  const save = useSaveAIProfile()
  const teams = useTeams().data ?? []
  const hasKey = profile.has_api_key
  const [form, setForm] = useState<AIProfileInput>(() => toInput(profile))
  const [apiKey, setApiKey] = useState('')
  const set = (patch: Partial<AIProfileInput>) => setForm((f) => ({ ...f, ...patch }))

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({ ...form, api_key: apiKey || null }, { onSuccess: () => setApiKey('') })
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} className="size-5" />
        {t('ai.settings.active')}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ai.settings.provider')}>
          <select value={form.provider} onChange={(e) => set({ provider: e.target.value as Provider })} className={field}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{t(`ai.providers.${p}`)}</option>)}
          </select>
        </Field>
        <Field label={t('ai.settings.model')}>
          <input value={form.model} onChange={(e) => set({ model: e.target.value })} className={field} placeholder="claude-sonnet-5-5" dir="ltr" />
        </Field>
      </div>

      {form.provider !== 'ollama' && (
        <Field label={t('ai.settings.apiKey')}>
          <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} dir="ltr"
            placeholder={hasKey ? t('ai.settings.keySaved') : ''} className={field} />
          <span className="text-xs text-muted-foreground">{t('ai.settings.keyHint')}</span>
        </Field>
      )}

      <Field label={t('ai.settings.systemPrompt')}>
        <textarea rows={3} value={form.system_prompt} onChange={(e) => set({ system_prompt: e.target.value })}
          className={`${field} py-2`} dir="auto" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('ai.settings.language')}>
          <select value={form.language} onChange={(e) => set({ language: e.target.value })} className={field}>
            <option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option>
          </select>
        </Field>
        <Field label={t('ai.settings.tone')}>
          <select value={form.tone} onChange={(e) => set({ tone: e.target.value })} className={field}>
            {['professional', 'friendly', 'concise'].map((tone) => <option key={tone} value={tone}>{t(`ai.tones.${tone}`)}</option>)}
          </select>
        </Field>
        <Field label={t('ai.settings.length')}>
          <select value={form.length} onChange={(e) => set({ length: e.target.value as AIProfile['length'] })} className={field}>
            {(['short', 'medium', 'long'] as const).map((l) => <option key={l} value={l}>{t(`ai.lengths.${l}`)}</option>)}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4 shadow-xs">
        <legend className="px-1 text-sm font-semibold">{t('ai.settings.hours')}</legend>
        <div className="flex items-center gap-2 text-sm">
          <input type="number" min={0} max={23} aria-label={t('ai.settings.hoursStart')} value={form.hours_start ?? ''}
            onChange={(e) => set({ hours_start: e.target.value === '' ? null : Number(e.target.value) })} className={`${field} w-20`} />
          <span>→</span>
          <input type="number" min={0} max={23} aria-label={t('ai.settings.hoursEnd')} value={form.hours_end ?? ''}
            onChange={(e) => set({ hours_end: e.target.value === '' ? null : Number(e.target.value) })} className={`${field} w-20`} />
          <span className="text-muted-foreground">{t('ai.settings.hoursHint')}</span>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4 shadow-xs">
        <legend className="px-1 text-sm font-semibold">{t('ai.settings.visibility')}</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={form.share_tasks} onChange={(e) => set({ share_tasks: e.target.checked })} className="size-5" />
          {t('ai.settings.shareTasks')}
        </label>
        <Field label={t('ai.settings.audience')}>
          <select value={form.audience} onChange={(e) => set({ audience: e.target.value as Audience })} className={field}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{t(`ai.audiences.${a}`)}</option>)}
          </select>
        </Field>
        {form.audience === 'people' && people.map((p) => (
          <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={form.allowed_user_ids.includes(p.id)}
              onChange={() => set({ allowed_user_ids: toggle(form.allowed_user_ids, p.id) })} />
            {p.display_name}
          </label>
        ))}
        {form.audience === 'teams' && teams.map((team) => (
          <label key={team.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={form.allowed_team_ids.includes(team.id)}
              onChange={() => set({ allowed_team_ids: toggle(form.allowed_team_ids, team.id) })} />
            {team.name}
          </label>
        ))}
      </fieldset>

      {save.isSuccess && <p role="status" className="text-sm text-accent">{t('ai.settings.saved')}</p>}
      {save.isError && <p role="alert" className="text-sm text-danger">{t('ai.settings.saveFailed')}</p>}
      <Button type="submit" className="self-start" disabled={save.isPending}>{t('chat.save')}</Button>
    </form>
  )
}
