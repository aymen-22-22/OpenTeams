import { Bot, CalendarDays, Hash, Lock, Plus, ClipboardCheck, FolderKanban, Gauge, KanbanSquare, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { Person, Presence } from '@/features/auth/api'
import type { Channel } from '@/features/channels/api'

const DOT: Record<Presence, string> = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-neutral-400',
}

/** Pages reachable from the top of the left panel. */
export type Page = 'assistant' | 'myTasks' | 'calendar' | 'projects' | 'requests' | 'playbooks' | 'dashboard'

const PAGES = [
  { page: 'assistant', Icon: Bot, label: 'people.myAssistant' },
  { page: 'myTasks', Icon: KanbanSquare, label: 'tasks.myTasks' },
  { page: 'calendar', Icon: CalendarDays, label: 'calendar.title' },
  { page: 'projects', Icon: FolderKanban, label: 'projects.title' },
  { page: 'requests', Icon: ClipboardCheck, label: 'requests.title' },
  { page: 'playbooks', Icon: Workflow, label: 'playbooks.title' },
  { page: 'dashboard', Icon: Gauge, label: 'dashboard.title', managersOnly: true },
] as const

interface Props {
  people: Person[]
  unread: Map<string, number>
  selectedId: string | undefined
  isManager: boolean
  channels: Channel[]
  selectedChannelId: string | undefined
  onOpenChannel: (id: string) => void
  onBrowseChannels: () => void
  onSelect: (person: Person) => void
  onOpen: (page: Page) => void
}

export function PeoplePanel({ people, unread, selectedId, isManager, channels, selectedChannelId, onOpenChannel, onBrowseChannels, onSelect, onOpen }: Props) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('people.title')} className="flex h-full flex-col gap-2 p-2">
      <ul className="flex flex-col">
        {PAGES.filter((p) => isManager || !('managersOnly' in p)).map(({ page, Icon, label }) => (
          <li key={page}>
            <button type="button" onClick={() => onOpen(page)}
              className={cn('flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-start font-medium hover:bg-muted', page === 'assistant' && 'text-accent')}>
              <Icon className="size-5" aria-hidden />
              {t(label)}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between px-2 pt-2">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">{t('channels.title')}</h2>
        <button type="button" onClick={onBrowseChannels} aria-label={t('channels.browse')} title={t('channels.browse')}
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {channels.filter((c) => c.joined).map((c) => {
          const Icon = c.is_private ? Lock : Hash
          const count = unread.get(c.id) ?? 0
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpenChannel(c.id)} aria-current={c.id === selectedChannelId}
                className={cn('flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-muted', c.id === selectedChannelId && 'bg-muted', count > 0 && 'font-semibold')}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span dir="auto" className="min-w-0 flex-1 truncate">{c.name}</span>
                {count > 0 && (
                  <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground" aria-label={t('people.unread', { count })}>{count}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <h2 className="px-2 pt-2 text-xs font-semibold uppercase text-muted-foreground">{t('people.title')}</h2>
      <ul className="flex flex-col gap-1">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onSelect(person)}
              aria-current={person.id === selectedId}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-start hover:bg-muted',
                person.id === selectedId && 'bg-muted',
              )}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', DOT[person.presence])} aria-label={t(`people.status.${person.presence}`)} />
              <span className="min-w-0 flex-1 truncate">{person.display_name}</span>
              {(unread.get(person.id) ?? 0) > 0 && (
                <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground"
                  aria-label={t('people.unread', { count: unread.get(person.id) })}>
                  {unread.get(person.id)}
                </span>
              )}
              <span className={cn('shrink-0 rounded px-1.5 text-xs', person.ai_active ? 'bg-ai text-ai-foreground' : 'bg-muted text-muted-foreground')}>
                {t(person.ai_active ? 'people.aiActive' : 'people.aiInactive')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {people.length === 0 && <p className="px-2 text-sm text-muted-foreground">{t('people.empty')}</p>}
    </nav>
  )
}
