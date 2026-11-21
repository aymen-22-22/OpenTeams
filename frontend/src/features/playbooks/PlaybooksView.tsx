import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person, User } from '@/features/auth/api'
import { cn } from '@/lib/utils'

import { DEFAULT_PLAYBOOK, useDeletePlaybook, usePlaybooks, usePreview, useRunNow, useRuns, type Playbook } from './api'
import { PlaybookForm } from './PlaybookForm'

export const STATUS_COLOR = {
  delivered: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  awaiting_approval: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  rejected: 'bg-muted text-muted-foreground',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
} as const

function RunHistory({ playbookId, onOpenRun }: { playbookId: string; onOpenRun: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const runs = useRuns(playbookId).data ?? []
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">{t('playbooks.noRuns')}</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-2 text-start font-medium">{t('playbooks.when')}</th>
          <th className="py-2 text-start font-medium">{t('playbooks.status')}</th>
          <th className="py-2 text-start font-medium">{t('playbooks.cost')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="py-2">{fmt.format(new Date(r.created_at))} · {t(`playbooks.triggers.${r.trigger}`)}</td>
            <td><span className={cn('rounded px-2 py-0.5 text-xs', STATUS_COLOR[r.status])}>{t(`playbooks.statuses.${r.status}`)}</span></td>
            <td className="text-muted-foreground">{r.tokens} tok · {(r.duration_ms / 1000).toFixed(1)} s</td>
            <td className="text-end"><Button variant="ghost" onClick={() => onOpenRun(r.id)}>{t('playbooks.open')}</Button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PlaybookDetail({ playbook, me, people, onOpenRun, onDeleted }: {
  playbook: Playbook; me: User; people: Person[]; onOpenRun: (id: string) => void; onDeleted: () => void
}) {
  const { t } = useTranslation()
  const preview = usePreview()
  const runNow = useRunNow()
  const remove = useDeletePlaybook()
  const names = new Map(people.map((p) => [p.id, p.display_name]))
  const canSendToOthers = me.role !== 'employee'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => preview.mutate(playbook.id)} disabled={preview.isPending}>{t('playbooks.preview')}</Button>
        <Button onClick={() => runNow.mutate(playbook.id)} disabled={runNow.isPending}>{t('playbooks.runNow')}</Button>
        <Button variant="ghost" onClick={() => remove.mutate(playbook.id, { onSuccess: onDeleted })}>{t('chat.delete')}</Button>
      </div>
      {preview.data && (
        <section aria-label={t('playbooks.preview')} className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
          {Object.entries(preview.data.reports).map(([uid, text]) => (
            <div key={uid}>
              <h4 className="text-sm font-semibold">{names.get(uid) ?? '?'}</h4>
              <pre dir="auto" className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
            </div>
          ))}
        </section>
      )}
      <PlaybookForm key={playbook.id + playbook.next_run_at} playbook={playbook} initial={playbook} people={people}
        canSendToOthers={canSendToOthers} onSaved={() => undefined} />
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('playbooks.history')}</h3>
        <RunHistory playbookId={playbook.id} onOpenRun={onOpenRun} />
      </section>
    </div>
  )
}

interface Props {
  me: User
  people: Map<string, Person>
  onOpenRun: (runId: string) => void
}

/** Playbooks page: list, create, edit, preview, run now, history. */
export function PlaybooksView({ me, people, onOpenRun }: Props) {
  const { t, i18n } = useTranslation()
  const playbooks = usePlaybooks().data ?? []
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const current = playbooks.find((p) => p.id === selected)
  const everyone = [...people.values()]
  const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <section aria-label={t('playbooks.title')} className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('playbooks.title')}</h2>
        <Button onClick={() => setSelected('new')}>{t('playbooks.new')}</Button>
      </header>
      <ul className="flex flex-col gap-2">
        {playbooks.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setSelected(p.id)} aria-current={p.id === selected}
              className={cn('flex min-h-11 w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-start hover:bg-muted', p.id === selected && 'bg-muted')}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto" className="truncate font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`playbooks.kinds.${p.kind}`)} · {p.enabled ? `${t('playbooks.next')} ${fmt.format(new Date(p.next_run_at))}` : t('playbooks.disabled')}
                </span>
              </span>
              {p.approval_required && <span className="rounded bg-amber-100 px-2 text-xs text-amber-800">{t('playbooks.approvalBadge')}</span>}
              {p.use_ai && <span className="rounded bg-ai px-2 text-xs text-ai-foreground">IA</span>}
            </button>
          </li>
        ))}
      </ul>
      {playbooks.length === 0 && selected !== 'new' && <p className="text-sm text-muted-foreground">{t('playbooks.empty')}</p>}
      {selected === 'new' && (
        <PlaybookForm initial={{ ...DEFAULT_PLAYBOOK, name: t('playbooks.kinds.weekly_report') }} people={everyone}
          canSendToOthers={me.role !== 'employee'} onSaved={(p) => setSelected(p.id)} />
      )}
      {current && <PlaybookDetail playbook={current} me={me} people={everyone} onOpenRun={onOpenRun} onDeleted={() => setSelected(null)} />}
    </section>
  )
}
