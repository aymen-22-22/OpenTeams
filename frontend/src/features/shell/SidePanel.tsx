import { Bell, FileText, Pin, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { EmailAddressSection } from '@/features/bridge/EmailAddressSection'
import { usePins } from '@/features/chat/api'
import { useFiles } from '@/features/files/api'
import { FileIcon } from '@/features/files/FileIcon'
import { useDeleteReminder, useReminders } from '@/features/notifications/api'
import { STATUSES, useTaskCounts } from '@/features/tasks/api'
import { cn } from '@/lib/utils'

export const STATUS_DOT = { pending: 'bg-slate-400', in_progress: 'bg-sky-500', finished: 'bg-emerald-500' } as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ icon: Icon, text }: { icon: typeof Pin; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden />
      {text}
    </p>
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
    <aside className="flex h-full flex-col gap-7 p-5">
      <Section title={t('side.pins')}>
        {pins.length === 0 ? <Empty icon={Pin} text={t('side.noPins')} /> : (
          <ul className="flex flex-col gap-1.5">
            {pins.map((p) => (
              <li key={p.message.id} dir="auto" className="flex gap-2 rounded-lg bg-background p-2.5 text-sm shadow-xs ring-1 ring-border">
                <Pin className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                <span className="line-clamp-2">{p.message.body}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('side.files')}>
        {recentFiles.length === 0 ? <Empty icon={FileText} text={t('files.empty')} /> : (
          <div className="flex flex-wrap gap-2">{recentFiles.map((f) => <FileIcon key={f.id} file={f} />)}</div>
        )}
      </Section>

      {personId && (
        <Section title={t('side.tasks')}>
          <dl className="grid grid-cols-3 gap-2">
            {STATUSES.map((s) => (
              <div key={s} className="flex flex-col gap-1 rounded-xl bg-background p-2.5 shadow-xs ring-1 ring-border">
                <dt className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
                  <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[s])} aria-hidden />
                  {t(`tasks.${s}`)}
                </dt>
                <dd className="text-xl font-semibold tabular-nums">{counts?.[s] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <Button variant="outline" onClick={onOpenBoard}>{t('tasks.openBoard')}</Button>
        </Section>
      )}

      <Section title={t('side.reminders')}>
        {reminders.length === 0 ? <Empty icon={Bell} text={t('reminders.empty')} /> : (
          <ul className="flex flex-col gap-1.5">
            {reminders.slice(0, 5).map((r) => (
              <li key={r.id} className="group flex items-center gap-2 rounded-lg bg-background ps-3 text-sm shadow-xs ring-1 ring-border">
                <span className="flex min-w-0 flex-1 flex-col py-2">
                  <span dir="auto" className="truncate font-medium">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {when(r.remind_at)}
                    {r.recurrence !== 'none' && ` · ${t(`reminders.recurrence.${r.recurrence}`)}`}
                  </span>
                </span>
                <button type="button" aria-label={t('reminders.delete', { title: r.title })} onClick={() => removeReminder.mutate(r.id)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition hover:bg-muted hover:opacity-100 group-hover:opacity-100">
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={onNewReminder}>{t('reminders.new')}</Button>
      </Section>

      {conversationId && <EmailAddressSection conversationId={conversationId} />}
    </aside>
  )
}
