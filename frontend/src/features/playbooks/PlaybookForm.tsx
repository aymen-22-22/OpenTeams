import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'

import { KINDS, useSavePlaybook, type Frequency, type Kind, type Playbook, type PlaybookInput } from './api'

const field = 'field'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}</label>
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="size-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function PeoplePicker({ legend, people, value, onChange }: {
  legend: string; people: Person[]; value: string[]; onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="flex flex-col rounded-xl border border-border bg-background p-4 shadow-xs">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {people.map((p) => (
        <Check key={p.id} label={p.display_name} checked={value.includes(p.id)}
          onChange={(on) => onChange(on ? [...value, p.id] : value.filter((x) => x !== p.id))} />
      ))}
    </fieldset>
  )
}

interface Props {
  playbook?: Playbook
  initial: PlaybookInput
  people: Person[]
  canSendToOthers: boolean
  onSaved: (p: Playbook) => void
}

export function PlaybookForm({ playbook, initial, people, canSendToOthers, onSaved }: Props) {
  const { t } = useTranslation()
  const save = useSavePlaybook()
  const [form, setForm] = useState<PlaybookInput>(initial)
  const set = (patch: Partial<PlaybookInput>) => setForm((f) => ({ ...f, ...patch }))
  const kinds = canSendToOthers ? KINDS : KINDS.filter((k) => k !== 'monday_summary')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({ id: playbook?.id, input: form }, { onSuccess: onSaved })
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <Field label={t('playbooks.name')}>
        <input required maxLength={120} value={form.name} onChange={(e) => set({ name: e.target.value })} className={field} dir="auto" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('playbooks.kind')}>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value as Kind })} className={field}>
            {kinds.map((k) => <option key={k} value={k}>{t(`playbooks.kinds.${k}`)}</option>)}
          </select>
        </Field>
        <Check label={t('playbooks.enabled')} checked={form.enabled} onChange={(enabled) => set({ enabled })} />
      </div>

      <fieldset className="grid gap-3 rounded-xl border border-border bg-background p-4 shadow-xs sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">{t('playbooks.schedule')}</legend>
        <Field label={t('playbooks.frequency')}>
          <select value={form.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })} className={field}>
            {(['daily', 'weekly', 'monthly'] as const).map((f) => <option key={f} value={f}>{t(`playbooks.frequencies.${f}`)}</option>)}
          </select>
        </Field>
        {form.frequency === 'weekly' && (
          <Field label={t('playbooks.weekday')}>
            <select value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className={field}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{t(`playbooks.weekdays.${d}`)}</option>)}
            </select>
          </Field>
        )}
        {form.frequency === 'monthly' && (
          <Field label={t('playbooks.dayOfMonth')}>
            <input type="number" min={1} max={31} value={form.day_of_month} onChange={(e) => set({ day_of_month: Number(e.target.value) })} className={field} />
          </Field>
        )}
        <Field label={t('playbooks.hour')}>
          <input type="number" min={0} max={23} value={form.hour} onChange={(e) => set({ hour: Number(e.target.value) })} className={field} />
        </Field>
      </fieldset>

      <PeoplePicker legend={t('playbooks.scope')} people={people} value={form.scope_user_ids} onChange={(scope_user_ids) => set({ scope_user_ids })} />
      {canSendToOthers && (
        <PeoplePicker legend={t('playbooks.recipients')} people={people} value={form.recipient_ids} onChange={(recipient_ids) => set({ recipient_ids })} />
      )}

      <fieldset className="flex flex-col rounded-xl border border-border bg-background p-4 shadow-xs">
        <legend className="px-1 text-sm font-semibold">{t('playbooks.delivery')}</legend>
        <Check label={t('playbooks.inApp')} checked={form.deliver_in_app} onChange={(deliver_in_app) => set({ deliver_in_app })} />
        <Check label={t('playbooks.email')} checked={form.deliver_email} onChange={(deliver_email) => set({ deliver_email })} />
        <Check label={t('playbooks.approval')} checked={form.approval_required} onChange={(approval_required) => set({ approval_required })} />
        <Check label={t('playbooks.useAi')} checked={form.use_ai} onChange={(use_ai) => set({ use_ai })} />
      </fieldset>
      {form.use_ai && (
        <Field label={t('playbooks.instructions')}>
          <textarea rows={3} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} className={`${field} py-2`} dir="auto" />
        </Field>
      )}

      {save.isError && <p role="alert" className="text-sm text-danger">{t('playbooks.saveFailed')}</p>}
      <Button type="submit" className="self-start" disabled={save.isPending}>{t('chat.save')}</Button>
    </form>
  )
}
