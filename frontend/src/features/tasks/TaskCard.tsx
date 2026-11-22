import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlignLeft, CalendarDays, Flag, MessageSquare, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { Task } from './api'

const PRIORITY_TONE = { low: 'neutral', normal: 'accent', high: 'danger' } as const
const DAY_MS = 86_400_000

/** Whole days from today to the due date (negative when past), in local time. */
function daysUntil(due: string): number {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round((new Date(`${due}T12:00`).getTime() - today.getTime()) / DAY_MS)
}

/** "Aujourd'hui", "Demain", "Dans 3 jours", "En retard de 2 jours" or the date, with how urgent it looks. */
export function useDueLabel(task: Pick<Task, 'due_date' | 'overdue' | 'status'>): { text: string; tone: 'danger' | 'warning' | 'neutral' } | null {
  const { t, i18n } = useTranslation()
  if (!task.due_date) return null
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00`))
  if (task.status === 'finished') return { text: date, tone: 'neutral' }
  const days = daysUntil(task.due_date)
  if (task.overdue || days < 0) return { text: t('tasks.lateBy', { count: Math.max(1, -days) }), tone: 'danger' }
  if (days === 0) return { text: t('tasks.dueToday'), tone: 'warning' }
  if (days === 1) return { text: t('tasks.dueTomorrow'), tone: 'warning' }
  if (days < 7) return { text: t('tasks.dueIn', { count: days }), tone: 'neutral' }
  return { text: date, tone: 'neutral' }
}

function Counter({ Icon, count, label }: { Icon: typeof MessageSquare; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

interface Props {
  task: Task
  assigneeName: string
  onOpen: (task: Task) => void
}

export function TaskCard({ task, assigneeName, onOpen }: Props) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const due = useDueLabel(task)
  const messages = task.message_count ?? 0
  const files = task.file_count ?? 0
  const hasDetails = task.priority !== 'normal' || due !== null || task.description.trim() !== '' || messages > 0 || files > 0

  return (
    // A plain list item; the draggable button inside it. Its name is its visible content.
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative', isDragging && 'z-20')}>
      <div
        {...attributes}
        {...listeners}
        onClick={() => onOpen(task)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === 'Enter') onOpen(task)
        }}
        className={cn(
          'flex cursor-grab flex-col gap-2 rounded-xl border bg-background p-3 shadow-xs transition-[box-shadow,transform,border-color] duration-150',
          'hover:-translate-y-px hover:border-border-strong hover:shadow-md active:cursor-grabbing',
          task.overdue ? 'border-danger/40' : 'border-border',
          task.status === 'finished' && 'opacity-80',
          isDragging && 'rotate-[1.5deg] shadow-lg ring-2 ring-accent/40',
        )}
      >
        <span className="flex items-start gap-2">
          <span dir="auto" className={cn('min-w-0 flex-1 text-sm leading-snug font-medium', task.status === 'finished' && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
            {task.title}
          </span>
          {assigneeName && (
            <span className="shrink-0" title={assigneeName}>
              <span className="sr-only">{assigneeName}</span>
              <Avatar name={assigneeName} id={task.assignee_id ?? undefined} size="xs" />
            </span>
          )}
        </span>
        {hasDetails && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {task.priority !== 'normal' && (
            <Badge tone={PRIORITY_TONE[task.priority]}>
              <Flag className="size-3" aria-hidden />
              {t(`tasks.priority.${task.priority}`)}
            </Badge>
          )}
          {due && (
            <Badge tone={due.tone}>
              <CalendarDays className="size-3" aria-hidden />
              {due.text}
            </Badge>
          )}
          {task.description.trim() && (
            <span className="text-muted-foreground" title={t('tasks.hasDescription')}>
              <AlignLeft className="size-3.5" aria-hidden />
              <span className="sr-only">{t('tasks.hasDescription')}</span>
            </span>
          )}
          {messages > 0 && <Counter Icon={MessageSquare} count={messages} label={t('tasks.messages', { count: messages })} />}
          {files > 0 && <Counter Icon={Paperclip} count={files} label={t('tasks.files', { count: files })} />}
        </div>
        )}
      </div>
    </li>
  )
}
