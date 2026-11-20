import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { usePins } from '@/features/chat/api'
import { useFiles } from '@/features/files/api'
import { useDeleteReminder, useReminders } from '@/features/notifications/api'
import { FileIcon } from '@/features/files/FileIcon'
import { STATUSES, useTaskCounts } from '@/features/tasks/api'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

interface Props {
  conversationId: string | undefined
  personId: string | undefined
  onOpenBoard: () => void
  onNewReminder: () => void
}

export function SidePanel({ conversationId, personId, onOpenBoard, onNewReminder }: Props) {
  const { t, i18n } = useTranslation()
  const reminders = useReminders().data ?? []
  const removeReminder = useDeleteReminder()
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  const pins = usePins(conversationId).data ?? []
  const recentFiles = (useFiles(conversationId).data ?? []).slice(0, 4)
  const counts = useTaskCounts(personId).data

  return (
    <aside className="flex h-full flex-col gap-6 p-4">
      <Section title={t('side.pins')}>
        {pins.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('side.noPins')}</p>
        ) : (
          <ul className="list-disc ps-5 text-sm">
            {pins.map((p) => <li key={p.message.id} dir="auto" className="truncate">{p.message.body}</li>)}
          </ul>
        )}
      </Section>
      <Section title={t('side.files')}>
        {recentFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('files.empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">{recentFiles.map((f) => <FileIcon key={f.id} file={f} />)}</div>
        )}
      </Section>
      <Section title={t('side.tasks')}>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          {STATUSES.map((s) => (
            <div key={s} className="rounded-md bg-muted p-2">
              <dt className="text-muted-foreground">{t(`tasks.${s}`)}</dt>
              <dd className="text-lg font-semibold">{counts?.[s] ?? 0}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" onClick={onOpenBoard}>{t('tasks.openBoard')}</Button>
      </Section>
      <Section title={t('side.reminders')}>
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('reminders.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {reminders.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {when(r.remind_at)}
                    {r.recurrence !== 'none' && ` · ${t(`reminders.recurrence.${r.recurrence}`)}`}
                  </span>
                </span>
                <button type="button" aria-label={t('reminders.delete', { title: r.title })}
                  onClick={() => removeReminder.mutate(r.id)}
                  className="flex size-11 items-center justify-center rounded text-muted-foreground hover:bg-muted">×</button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={onNewReminder}>{t('reminders.new')}</Button>
      </Section>
    </aside>
  )
}
