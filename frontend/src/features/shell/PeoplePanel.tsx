import { Bot, CalendarDays, ClipboardCheck, FolderKanban, Gauge, Hash, KanbanSquare, Lock, Plus, Sparkles, Workflow, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import type { Person } from '@/features/auth/api'
import type { Channel } from '@/features/channels/api'
import { cn } from '@/lib/utils'

/** Pages reachable from the top of the left panel. */
export type Page = 'assistant' | 'myTasks' | 'calendar' | 'projects' | 'requests' | 'playbooks' | 'dashboard'

const PAGES: { page: Page; Icon: LucideIcon; label: string; managersOnly?: boolean }[] = [
  { page: 'assistant', Icon: Bot, label: 'people.myAssistant' },
  { page: 'myTasks', Icon: KanbanSquare, label: 'tasks.myTasks' },
  { page: 'calendar', Icon: CalendarDays, label: 'calendar.title' },
  { page: 'projects', Icon: FolderKanban, label: 'projects.title' },
  { page: 'requests', Icon: ClipboardCheck, label: 'requests.title' },
  { page: 'playbooks', Icon: Workflow, label: 'playbooks.title' },
  { page: 'dashboard', Icon: Gauge, label: 'dashboard.title', managersOnly: true },
]

const item = 'group flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm transition-colors duration-150'
const itemIdle = 'text-foreground/80 hover:bg-muted hover:text-foreground'
const itemActive = 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border'

function UnreadBadge({ count, label }: { count: number; label: string }) {
  return (
    <span aria-label={label} className="ms-auto min-w-5 shrink-0 animate-pop rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-semibold text-accent-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex min-h-9 items-center justify-between ps-2.5">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  )
}

interface Props {
  people: Person[]
  unread: Map<string, number>
  selectedId: string | undefined
  activePage?: Page
  isManager: boolean
  channels: Channel[]
  selectedChannelId: string | undefined
  onOpenChannel: (id: string) => void
  onBrowseChannels: () => void
  onSelect: (person: Person) => void
  onOpen: (page: Page) => void
}

export function PeoplePanel(props: Props) {
  const { people, unread, selectedId, activePage, isManager, channels, selectedChannelId, onOpenChannel, onBrowseChannels, onSelect, onOpen } = props
  const { t } = useTranslation()

  return (
    <nav aria-label={t('people.title')} className="flex flex-col gap-4 px-2.5 pb-4">
      <ul className="flex flex-col gap-0.5">
        {PAGES.filter((p) => isManager || !p.managersOnly).map(({ page, Icon, label }) => (
          <li key={page}>
            <button type="button" onClick={() => onOpen(page)} aria-current={page === activePage ? 'page' : undefined}
              className={cn(item, page === activePage ? itemActive : itemIdle)}>
              <Icon className={cn('size-[18px]', page === 'assistant' ? 'text-ai-foreground' : 'text-muted-foreground group-hover:text-foreground', page === activePage && 'text-accent')} aria-hidden />
              {t(label)}
            </button>
          </li>
        ))}
      </ul>

      <Section title={t('channels.title')} action={
        <button type="button" onClick={onBrowseChannels} aria-label={t('channels.browse')} title={t('channels.browse')}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Plus className="size-4" aria-hidden />
        </button>
      }>
        {channels.filter((c) => c.joined).map((c) => {
          const Icon = c.is_private ? Lock : Hash
          const count = unread.get(c.id) ?? 0
          const active = c.id === selectedChannelId
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpenChannel(c.id)} aria-current={active}
                className={cn(item, active ? itemActive : itemIdle, count > 0 && 'font-semibold text-foreground')}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span dir="auto" className="min-w-0 flex-1 truncate">{c.name}</span>
                {count > 0 && <UnreadBadge count={count} label={t('people.unread', { count })} />}
              </button>
            </li>
          )
        })}
      </Section>

      <Section title={t('people.title')}>
        {people.map((person) => {
          const count = unread.get(person.id) ?? 0
          const active = person.id === selectedId
          return (
            <li key={person.id}>
              <button type="button" onClick={() => onSelect(person)} aria-current={active}
                className={cn(item, 'min-h-11', active ? itemActive : itemIdle, count > 0 && 'font-semibold text-foreground')}
                style={{ '--avatar-ring': active ? 'var(--background)' : 'var(--sidebar)' } as React.CSSProperties}>
                <Avatar name={person.display_name} id={person.id} size="sm" presence={person.presence}
                  presenceLabel={t(`people.status.${person.presence}`)} />
                <span className="min-w-0 flex-1 truncate">{person.display_name}</span>
                {count > 0 && <UnreadBadge count={count} label={t('people.unread', { count })} />}
                {/* AI badge: compact "IA" pill; the full state is read by screen readers */}
                <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold',
                  person.ai_active ? 'bg-ai text-ai-foreground' : 'bg-muted text-muted-foreground')}>
                  {person.ai_active && <Sparkles className="size-3" aria-hidden />}
                  {t(person.ai_active ? 'people.aiActive' : 'people.aiInactive')}
                </span>
              </button>
            </li>
          )
        })}
        {people.length === 0 && <li className="px-2.5 text-sm text-muted-foreground">{t('people.empty')}</li>}
      </Section>
    </nav>
  )
}
