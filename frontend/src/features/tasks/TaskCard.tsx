import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { Task } from './api'

const PRIORITY_COLOR = { low: 'bg-neutral-400', normal: 'bg-blue-500', high: 'bg-red-600' } as const

interface Props {
  task: Task
  assigneeName: string
  onOpen: (task: Task) => void
}

export function TaskCard({ task, assigneeName, onOpen }: Props) {
  const { t, i18n } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const due = task.due_date
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(task.due_date))
    : null

  return (
    // A plain list item; the draggable button inside it. Its name is its visible content.
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-50')}>
      <div
        {...attributes}
        {...listeners}
        onClick={() => onOpen(task)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === 'Enter') onOpen(task)
        }}
        className={cn(
          'flex cursor-grab flex-col gap-2 rounded-md border bg-background p-3 shadow-sm',
          task.overdue ? 'border-red-500' : 'border-border',
        )}
      >
        <span dir="auto" className="font-medium">{task.title}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('size-2 rounded-full', PRIORITY_COLOR[task.priority])} aria-label={t(`tasks.priority.${task.priority}`)} />
          <span className="flex-1 truncate">{assigneeName}</span>
          {due && (
            <span className={cn('flex items-center gap-1', task.overdue && 'font-semibold text-red-600')}>
              <CalendarDays className="size-3" aria-hidden />
              {due}
              {task.overdue && <span>· {t('tasks.overdue')}</span>}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
