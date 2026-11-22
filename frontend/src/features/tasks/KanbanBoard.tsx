import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Person } from '@/features/auth/api'
import { STATUS_DOT } from '@/features/shell/SidePanel'
import { cn } from '@/lib/utils'

import { STATUSES, useCreateTask, useMoveTask, type Task, type TaskStatus } from './api'
import { TaskCard } from './TaskCard'

/** Type a title at the bottom of a column: Enter adds it there, the field stays open for the next one. */
function QuickAdd({ status, assigneeId }: { status: TaskStatus; assigneeId: string }) {
  const { t } = useTranslation()
  const create = useCreateTask()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
        <Plus className="size-4" aria-hidden />
        {t('tasks.quickAdd')}
      </button>
    )
  }
  const submit = () => {
    const value = title.trim()
    if (!value || create.isPending) return
    create.mutate({ title: value, status, assignee_id: assigneeId }, { onSuccess: () => setTitle('') })
  }
  return (
    <div className="flex animate-fade-in flex-col gap-1">
      <textarea autoFocus rows={2} value={title} dir="auto" maxLength={200}
        aria-label={t('tasks.quickAddLabel', { column: t(`tasks.${status}`) })} placeholder={t('tasks.quickAdd')}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          if (e.key === 'Escape') { setTitle(''); setOpen(false) }
        }}
        onBlur={() => { if (!title.trim()) setOpen(false) }}
        className="field resize-none py-2 text-sm" />
      {create.isError
        ? <p role="alert" className="px-1 text-xs text-danger">{t('tasks.createFailed')}</p>
        : <p className="px-1 text-[11px] text-muted-foreground" aria-hidden>{t('tasks.quickAddHint')}</p>}
    </div>
  )
}

function Column({ status, tasks, children, footer }: { status: TaskStatus; tasks: Task[]; children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section aria-label={t(`tasks.${status}`)}
      className={cn('flex min-w-0 flex-col gap-2 rounded-2xl bg-sidebar p-2.5 ring-1 ring-border transition-[box-shadow,background-color] duration-150', isOver && 'bg-accent-soft/50 ring-2 ring-accent')}>
      <h3 className="flex items-center gap-2 px-1.5 pt-0.5 pb-1 text-sm font-semibold">
        <span className={cn('size-2 rounded-full', STATUS_DOT[status])} aria-hidden />
        {t(`tasks.${status}`)}
        <span className="ms-auto rounded-full bg-background px-2 text-xs font-medium text-muted-foreground tabular-nums ring-1 ring-border">{tasks.length}</span>
      </h3>
      <ol ref={setNodeRef} className="flex min-h-28 flex-col gap-2">
        {children}
        {tasks.length === 0 && (
          <li aria-hidden className="flex min-h-24 items-center justify-center rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground">
            {t('tasks.dropHere')}
          </li>
        )}
      </ol>
      {footer}
    </section>
  )
}

/** Where a drop lands: the target column and the task it goes right after (null = top). */
export function dropTarget(tasks: Task[], activeId: string, overId: string) {
  const active = tasks.find((t) => t.id === activeId)
  const overTask = tasks.find((t) => t.id === overId)
  const status = (overTask?.status ?? overId) as TaskStatus
  if (!active || !STATUSES.includes(status)) return null

  const column = tasks.filter((t) => t.status === status)
  const others = column.filter((t) => t.id !== activeId)
  let index = overTask ? others.findIndex((t) => t.id === overTask.id) : others.length
  const movingDown =
    overTask && active.status === status && column.indexOf(active) < column.indexOf(overTask)
  if (movingDown) index += 1
  return { status, after_id: others[index - 1]?.id ?? null }
}

interface Props {
  tasks: Task[]
  people: Map<string, Person>
  onOpen: (task: Task) => void
  /** Whose board this is: quick add assigns new tasks to them. Without it, no quick add. */
  assigneeId?: string
}

export function KanbanBoard({ tasks, people, onOpen, assigneeId }: Props) {
  const move = useMoveTask()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a click still opens the task
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const target = dropTarget(tasks, String(active.id), String(over.id))
    if (target) move.mutate({ id: String(active.id), ...target })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="grid items-start gap-4 md:grid-cols-3">
        {STATUSES.map((status) => {
          const column = tasks.filter((t) => t.status === status)
          return (
            <Column key={status} status={status} tasks={column} footer={assigneeId && <QuickAdd status={status} assigneeId={assigneeId} />}>
              <SortableContext items={column.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {column.map((task) => (
                  <TaskCard key={task.id} task={task} onOpen={onOpen}
                    assigneeName={people.get(task.assignee_id ?? '')?.display_name ?? ''} />
                ))}
              </SortableContext>
            </Column>
          )
        })}
      </div>
    </DndContext>
  )
}
