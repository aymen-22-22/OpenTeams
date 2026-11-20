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
    <section aria-label={t('tasks.myTasks')} className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('tasks.myTasks')}</h2>
        <Button onClick={onNew}>{t('tasks.new')}</Button>
      </header>
      <KanbanBoard tasks={tasks} people={people} onOpen={onOpen} />
    </section>
  )
}
