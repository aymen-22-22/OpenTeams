import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Modal, ModalActions } from '@/components/ui/modal'

import { useCreateReminder, type Recurrence, type ReminderInput } from './api'

const field = 'field'

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">, one hour from now. */
function inOneHour(): string {
  const d = new Date(Date.now() + 3600_000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

interface Props {
  initial: Partial<ReminderInput>
  onDone: () => void
}

export function ReminderForm({ initial, onDone }: Props) {
  const { t } = useTranslation()
  const create = useCreateReminder()
  const [title, setTitle] = useState(initial.title ?? '')
  const [when, setWhen] = useState(inOneHour)
  const [recurrence, setRecurrence] = useState<Recurrence>('none')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        title: title.trim(),
        remind_at: new Date(when).toISOString(), // local time -> UTC with timezone
        recurrence,
        target_type: initial.target_type ?? null,
        target_id: initial.target_id ?? null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <Modal title={t('reminders.new')} onClose={onDone}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('reminders.what')}
          <input required autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} dir="auto" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('reminders.when')}
          <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('reminders.repeat')}
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} className={field}>
            {(['none', 'daily', 'weekly', 'monthly'] as const).map((r) => <option key={r} value={r}>{t(`reminders.recurrence.${r}`)}</option>)}
          </select>
        </label>
        {create.isError && <p role="alert" className="text-sm text-danger">{t('reminders.failed')}</p>}
        <ModalActions>
          <Button type="button" variant="ghost" onClick={onDone}>{t('chat.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{t('reminders.save')}</Button>
        </ModalActions>
      </form>
    </Modal>
  )
}
