import { CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Hash, KanbanSquare, MessageSquare, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import type { Person, User } from '@/features/auth/api'
import { useEvents } from '@/features/calendar/api'
import type { Conversation } from '@/features/chat/api'
import { useRequests } from '@/features/requests/api'
import { useTasks, type Task } from '@/features/tasks/api'
import { cn } from '@/lib/utils'

const LIST_LIMIT = 6

interface Props {
  me: User
  peopleById: Map<string, Person>
  conversations: Conversation[]
  onOpenConversation: (id: string) => void
  onOpenTask: (task: Task) => void
  onOpenPage: (page: 'myTasks' | 'calendar' | 'requests') => void
}

function Card({ title, Icon, count, action, children }: { title: string; Icon: LucideIcon; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col" aria-label={title}>
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-4">
        <Icon className="size-4 text-accent" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-2 text-xs leading-5 font-medium text-muted-foreground tabular-nums">{count}</span>
        )}
        <span className="ms-auto">{action}</span>
      </header>
      <div className="flex flex-1 flex-col p-2">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-success" aria-hidden />
      {children}
    </p>
  )
}

function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-[13px] font-medium text-accent hover:bg-accent-soft">
      {label}
      <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
    </button>
  )
}

const row = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-muted'

/** Start page: what needs my attention now. */
export function HomeView({ me, peopleById, conversations, onOpenConversation, onOpenTask, onOpenPage }: Props) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => new Date())
  const tasks = useTasks(me.id).data
  const toApprove = (useRequests('to_approve').data ?? []).filter((r) => r.status === 'pending')
  const until = useMemo(() => {
    const d = new Date(now)
    d.setDate(d.getDate() + 2)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])
  const events = (useEvents(now, until, { kind: 'me' }, me.id).data ?? [])
    .filter((e) => e.type !== 'task_finished')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const unread = conversations.filter((c) => c.unread_count > 0)
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  const dueTasks = (tasks ?? [])
    .filter((task) => task.status !== 'finished' && task.due_date && (task.overdue || task.due_date <= weekAhead))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  const overdue = dueTasks.filter((task) => task.overdue).length

  const hour = now.getHours()
  const greeting = t(hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening', { name: me.display_name.split(' ')[0] })
  const today = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const time = (iso: string) => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const day = (iso: string) => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(iso))
  const isToday = (iso: string) => new Date(iso).toDateString() === now.toDateString()

  /** Who or what a conversation is about, for the unread list. */
  const label = (c: Conversation) => {
    if (c.type === 'direct') {
      const other = peopleById.get(c.member_ids.find((id) => id !== me.id) ?? '')
      return { name: other?.display_name ?? '…', avatar: other ? <Avatar name={other.display_name} id={other.id} size="sm" /> : null }
    }
    const Icon = c.type === 'channel' ? Hash : KanbanSquare
    return {
      name: c.title ?? '…',
      avatar: <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden /></span>,
    }
  }

  const summary = [
    { n: unread.reduce((sum, c) => sum + c.unread_count, 0), key: 'home.sumUnread' },
    { n: overdue, key: 'home.sumOverdue', danger: true },
    { n: events.filter((e) => isToday(e.starts_at)).length, key: 'home.sumToday' },
    { n: toApprove.length, key: 'home.sumApprovals' },
  ].filter((s) => s.n > 0)

  return (
    <section aria-label={t('home.title')} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground first-letter:uppercase">{today}</p>
          <h1 className="page-title">{greeting}</h1>
          <p className="text-sm text-muted-foreground">
            {summary.length === 0 ? t('home.allClear') : summary.map((s, i) => (
              <span key={s.key}>
                {i > 0 && ' · '}
                <span className={cn('font-medium', s.danger ? 'text-danger' : 'text-foreground')}>{t(s.key, { count: s.n })}</span>
              </span>
            ))}
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('home.unread')} Icon={MessageSquare} count={unread.length}>
            {unread.length === 0 ? <Empty>{t('home.noUnread')}</Empty> : (
              <ul className="flex flex-col">
                {unread.slice(0, LIST_LIMIT).map((c) => {
                  const { name, avatar } = label(c)
                  const last = c.last_message
                  return (
                    <li key={c.id}>
                      <button type="button" className={row} onClick={() => onOpenConversation(c.id)}>
                        {avatar}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span dir="auto" className="truncate text-sm font-semibold">{name}</span>
                          <span dir="auto" className="truncate text-[13px] text-muted-foreground">{last && !last.deleted ? last.body.split('\n')[0] : ''}</span>
                        </span>
                        <span aria-label={t('people.unread', { count: c.unread_count })}
                          className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-semibold text-accent-foreground">
                          {c.unread_count > 99 ? '99+' : c.unread_count}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card title={t('home.tasks')} Icon={KanbanSquare} count={dueTasks.length} action={<SeeAll label={t('home.seeAll')} onClick={() => onOpenPage('myTasks')} />}>
            {tasks && dueTasks.length === 0 ? <Empty>{t('home.noTasks')}</Empty> : (
              <ul className="flex flex-col">
                {dueTasks.slice(0, LIST_LIMIT).map((task) => (
                  <li key={task.id}>
                    <button type="button" className={row} onClick={() => onOpenTask(task)}>
                      <span className={cn('size-2 shrink-0 rounded-full', task.status === 'in_progress' ? 'bg-sky-500' : 'bg-slate-400')} aria-hidden />
                      <span dir="auto" className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                      <span className={cn('shrink-0 rounded-md px-1.5 text-xs leading-5 font-medium tabular-nums',
                        task.overdue ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground')}>
                        {task.overdue ? t('home.overdueSince', { date: day(task.due_date!) }) : day(task.due_date!)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('home.agenda')} Icon={CalendarDays} count={events.length} action={<SeeAll label={t('home.openCalendar')} onClick={() => onOpenPage('calendar')} />}>
            {events.length === 0 ? <Empty>{t('home.noEvents')}</Empty> : (
              <ul className="flex flex-col">
                {events.slice(0, LIST_LIMIT).map((e) => (
                  <li key={e.id} className="flex min-h-12 items-center gap-3 px-2 py-1.5">
                    <span className="flex w-20 shrink-0 flex-col text-xs leading-tight">
                      <span className="font-medium">{isToday(e.starts_at) ? t('home.today') : t('home.tomorrow')}</span>
                      <span className="text-muted-foreground tabular-nums">{e.all_day ? t('home.allDay') : time(e.starts_at)}</span>
                    </span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {toApprove.length > 0 && (
            <Card title={t('home.approvals')} Icon={ClipboardCheck} count={toApprove.length} action={<SeeAll label={t('home.seeAll')} onClick={() => onOpenPage('requests')} />}>
              <ul className="flex flex-col">
                {toApprove.slice(0, LIST_LIMIT).map((r) => {
                  const who = peopleById.get(r.requester_id)
                  return (
                    <li key={r.id}>
                      <button type="button" className={row} onClick={() => onOpenPage('requests')}>
                        {who && <Avatar name={who.display_name} id={who.id} size="sm" />}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span dir="auto" className="truncate text-sm font-medium">{r.title}</span>
                          <span className="truncate text-[13px] text-muted-foreground">{who?.display_name} · {t(`requests.kinds.${r.kind}`)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </section>
  )
}
