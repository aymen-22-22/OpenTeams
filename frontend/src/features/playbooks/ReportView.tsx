import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'
import { cn } from '@/lib/utils'

import { useDecide, useReport } from './api'
import { STATUS_COLOR } from './PlaybooksView'

/** One playbook run: the reader's report, or every report plus approve/reject for the owner. */
export function ReportView({ runId, people }: { runId: string; people: Map<string, Person> }) {
  const { t, i18n } = useTranslation()
  const report = useReport(runId)
  const decide = useDecide(runId)

  if (report.isError) return <p className="p-4 text-sm text-muted-foreground">{t('playbooks.reportNotFound')}</p>
  if (!report.data) return null
  const { run, playbook_name, is_owner, reports } = report.data
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })
  const waiting = is_owner && run.status === 'awaiting_approval'

  return (
    <section aria-label={playbook_name} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 dir="auto" className="page-title">{playbook_name}</h2>
        <span className={cn('rounded px-2 py-0.5 text-xs', STATUS_COLOR[run.status])}>{t(`playbooks.statuses.${run.status}`)}</span>
        <span className="text-sm text-muted-foreground">
          {fmt.format(new Date(run.period_start))} → {fmt.format(new Date(run.period_end))}
        </span>
      </header>
      {waiting && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <span className="flex-1">{t('playbooks.awaitingHint')}</span>
          <Button onClick={() => decide.mutate('approve')} disabled={decide.isPending}>{t('playbooks.approve')}</Button>
          <Button variant="outline" onClick={() => decide.mutate('reject')} disabled={decide.isPending}>{t('playbooks.reject')}</Button>
        </div>
      )}
      {Object.entries(reports).map(([uid, text]) => (
        <article key={uid} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-5 shadow-xs">
          {is_owner && <h3 className="text-sm font-semibold text-muted-foreground">{t('playbooks.for', { name: people.get(uid)?.display_name ?? '?' })}</h3>}
          <pre dir="auto" className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{text}</pre>
        </article>
      ))}
      {run.inputs.ai && <p className="text-xs text-ai-foreground">{t('playbooks.writtenByAi')}</p>}
      </div>
    </section>
  )
}
