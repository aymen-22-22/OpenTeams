import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { usePins } from '@/features/chat/api'
import { useFiles } from '@/features/files/api'
import { FileIcon } from '@/features/files/FileIcon'

import { REMINDERS, TASK_COUNTS, type TaskStatus } from './placeholder'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

export function SidePanel({ conversationId }: { conversationId: string | undefined }) {
  const { t } = useTranslation()
  const pins = usePins(conversationId).data ?? []
  const recentFiles = (useFiles(conversationId).data ?? []).slice(0, 4)
  const statuses = Object.keys(TASK_COUNTS) as TaskStatus[]

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
          {statuses.map((s) => (
            <div key={s} className="rounded-md bg-muted p-2">
              <dt className="text-muted-foreground">{t(`tasks.${s}`)}</dt>
              <dd className="text-lg font-semibold">{TASK_COUNTS[s]}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline">{t('tasks.openBoard')}</Button>
      </Section>
      <Section title={t('side.reminders')}>
        <ul className="text-sm">{REMINDERS.map((r) => <li key={r}>{r}</li>)}</ul>
      </Section>
    </aside>
  )
}
