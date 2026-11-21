import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { Task } from './api'

const PRIORITY_TONE = { low: 'neutral', normal: 'accent', high: 'danger' } as const

interface Props {
  task: Task
  assigneeName: string
  onOpen: (task: Task) => void
}

export function TaskCard({ task, assigneeName, onOpen }: Props) {
  const { t, i18n } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const due = task.due_date
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(`${task.due_date}T12:00`))
    : null

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
          'flex cursor-grab flex-col gap-2.5 rounded-xl border bg-background p-3 shadow-xs transition-[box-shadow,transform,border-color] duration-150',
          'hover:-translate-y-px hover:border-border-strong hover:shadow-md active:cursor-grabbing',
          task.overdue ? 'border-danger/40' : 'border-border',
          task.status === 'finished' && 'opacity-80',
          isDragging && 'rotate-[1.5deg] shadow-lg ring-2 ring-accent/40',
        )}
      >
        <span dir="auto" className={cn('text-sm leading-snug font-medium', task.status === 'finished' && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
          {task.title}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {task.priority !== 'normal' && (
            <Badge tone={PRIORITY_TONE[task.priority]}>
              <Flag className="size-3" aria-hidden />
              {t(`tasks.priority.${task.priority}`)}
            </Badge>
          )}
          {due && (
            <Badge tone={task.overdue ? 'danger' : 'neutral'}>
              <CalendarDays className="size-3" aria-hidden />
              {due}
              {task.overdue && <span>· {t('tasks.overdue')}</span>}
            </Badge>
          )}
          {assigneeName && (
            <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="sr-only">{assigneeName}</span>
              <span title={assigneeName}><Avatar name={assigneeName} id={task.assignee_id ?? undefined} size="xs" /></span>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
