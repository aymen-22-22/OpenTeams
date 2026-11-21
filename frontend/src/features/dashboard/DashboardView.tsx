import { PartyPopper } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '@/components/ui/empty-state'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useTeams } from '@/features/ai/api'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Load {
  user_id: string
  display_name: string
  pending: number
  in_progress: number
  overdue: number
  planned: number
  finished_planned: number
  finished: number
}

interface Dashboard {
  period_start: string
  period_end: string
  people: Load[]
  totals: Load
  delays: { task_id: string; title: string; assignee_id: string | null; due_date: string; days_late: number }[]
}

function Ratio({ done, planned }: { done: number; planned: number }) {
  const { t } = useTranslation()
  const pct = planned ? Math.round((100 * done) / planned) : 0
  return (
    <span className="flex items-center gap-2" aria-label={t('dashboard.ratio', { done, planned })}>
      <span className="h-2 w-16 overflow-hidden rounded bg-muted"><span className="block h-full bg-accent" style={{ inlineSize: `${pct}%` }} /></span>
      <span className="tabular-nums">{done}/{planned}</span>
    </span>
  )
}

/** Manager dashboard: workload, delays, finished versus planned. */
export function DashboardView({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { t, i18n } = useTranslation()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [team, setTeam] = useState('')
  const teams = useTeams().data ?? []
  const data = useQuery({
    queryKey: ['dashboard', period, team],
    queryFn: () => api<Dashboard>(`/dashboard?period=${period}${team ? `&team_id=${team}` : ''}`),
  }).data
  const fmt = (d: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(`${d}T12:00`))
  const names = new Map(data?.people.map((p) => [p.user_id, p.display_name]))
  const rows = data ? [...data.people.filter((p) => p.pending + p.in_progress + p.planned + p.finished > 0)] : []

  return (
    <section aria-label={t('dashboard.title')} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="page-title me-auto">{t('dashboard.title')}</h2>
        <select aria-label={t('dashboard.period')} value={period} onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}
          className="field">
          <option value="week">{t('dashboard.week')}</option>
          <option value="month">{t('dashboard.month')}</option>
        </select>
        <select aria-label={t('dashboard.team')} value={team} onChange={(e) => setTeam(e.target.value)}
          className="field">
          <option value="">{t('dashboard.everyone')}</option>
          {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
      </header>
      {data && (
        <>
          <p className="text-sm text-muted-foreground">{fmt(data.period_start)} → {fmt(data.period_end)}</p>
          <div className="card overflow-x-auto px-4 py-1">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-2 text-start font-medium">{t('dashboard.person')}</th>
                  <th className="py-2 font-medium">{t('tasks.pending')}</th>
                  <th className="py-2 font-medium">{t('tasks.in_progress')}</th>
                  <th className="py-2 font-medium">{t('dashboard.overdue')}</th>
                  <th className="py-2 font-medium">{t('dashboard.finishedVsPlanned')}</th>
                  <th className="py-2 font-medium">{t('dashboard.finished')}</th>
                </tr>
              </thead>
              <tbody>
                {[...rows, { ...data.totals, display_name: t('dashboard.total') }].map((r, i) => (
                  <tr key={i} className={cn('border-t border-border', i === rows.length && 'font-semibold')}>
                    <td className="py-2">{r.display_name}</td>
                    <td className="text-center tabular-nums">{r.pending}</td>
                    <td className="text-center tabular-nums">{r.in_progress}</td>
                    <td className={cn('text-center tabular-nums', r.overdue > 0 && 'font-semibold text-danger')}>{r.overdue}</td>
                    <td><div className="flex justify-center"><Ratio done={r.finished_planned} planned={r.planned} /></div></td>
                    <td className="text-center tabular-nums">{r.finished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t('dashboard.delays')}</h3>
            {data.delays.length === 0 ? <EmptyState icon={PartyPopper} title={t('dashboard.noDelays')} className="py-6" /> : (
              <ul className="flex flex-col gap-1">
                {data.delays.map((d) => (
                  <li key={d.task_id}>
                    <button type="button" onClick={() => onOpenTask(d.task_id)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 text-start text-sm hover:bg-muted">
                      <span dir="auto" className="flex-1 truncate">{d.title}</span>
                      <span className="text-muted-foreground">{names.get(d.assignee_id ?? '') ?? ''}</span>
                      <span className="font-semibold text-danger">{t('dashboard.daysLate', { count: d.days_late })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      </div>
    </section>
  )
}
