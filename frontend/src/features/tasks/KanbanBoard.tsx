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
import { useTranslation } from 'react-i18next'

import type { Person } from '@/features/auth/api'

import { STATUSES, useMoveTask, type Task, type TaskStatus } from './api'
import { TaskCard } from './TaskCard'

function Column({ status, tasks, children }: { status: TaskStatus; tasks: Task[]; children: React.ReactNode }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section aria-label={t(`tasks.${status}`)} className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted p-2">
      <h3 className="flex items-center justify-between px-1 text-sm font-semibold">
        {t(`tasks.${status}`)}
        <span className="text-muted-foreground">{tasks.length}</span>
      </h3>
      <ol ref={setNodeRef} className={`flex min-h-24 flex-col gap-2 rounded-md ${isOver ? 'ring-2 ring-accent' : ''}`}>
        {children}
      </ol>
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
}

export function KanbanBoard({ tasks, people, onOpen }: Props) {
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
      <div className="grid gap-3 md:grid-cols-3">
        {STATUSES.map((status) => {
          const column = tasks.filter((t) => t.status === status)
          return (
            <Column key={status} status={status} tasks={column}>
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
