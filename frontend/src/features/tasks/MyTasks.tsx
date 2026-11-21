import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'

import { useTasks, type Task } from './api'
import { KanbanBoard } from './KanbanBoard'

interface Props {
  meId: string
  people: Map<string, Person>
  onOpen: (task: Task) => void
  onNew: () => void
}

/** Personal board: every task assigned to me, across conversations. */
export function MyTasks({ meId, people, onOpen, onNew }: Props) {
  const { t } = useTranslation()
  const tasks = useTasks(meId).data ?? []
  return (
    <section aria-label={t('tasks.myTasks')} className="h-full overflow-y-auto">
      <div className="page flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">{t('tasks.myTasks')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('tasks.myTasksHint')}</p>
        </div>
        <Button onClick={onNew}><Plus className="size-4" aria-hidden />{t('tasks.new')}</Button>
      </header>
      <KanbanBoard tasks={tasks} people={people} onOpen={onOpen} />
      </div>
    </section>
  )
}
