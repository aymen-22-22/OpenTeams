import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Modal, ModalActions } from '@/components/ui/modal'
import type { Person } from '@/features/auth/api'
import { useProjects } from '@/features/projects/api'

import { useCreateTask, type Priority, type Task, type TaskInput } from './api'

interface Props {
  people: Person[]
  initial: Partial<TaskInput>
  onCreated: (task: Task) => void
  onCancel: () => void
}

const field = 'field'

export function TaskForm({ people, initial, onCreated, onCancel }: Props) {
  const { t } = useTranslation()
  const create = useCreateTask()
  const [title, setTitle] = useState(initial.title ?? '')
  const [assignee, setAssignee] = useState(initial.assignee_id ?? '')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [project, setProject] = useState(initial.project_id ?? '')
  const projects = (useProjects().data ?? []).filter((p) => p.status !== 'finished')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        title: title.trim(),
        assignee_id: assignee || undefined,
        due_date: due || null,
        priority,
        source_message_id: initial.source_message_id ?? null,
        project_id: project || null,
      },
      { onSuccess: onCreated },
    )
  }

  return (
    <Modal title={t('tasks.new')} onClose={onCancel}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('tasks.title')}
          <input required autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} dir="auto" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('tasks.assignee')}
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
            <option value="">{t('tasks.me')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('tasks.dueDate')}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('tasks.priorityLabel')}
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={field}>
              {(['low', 'normal', 'high'] as const).map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}`)}</option>)}
            </select>
          </label>
        </div>
        {projects.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('projects.project')}
            <select value={project} onChange={(e) => setProject(e.target.value)} className={field}>
              <option value="">{t('projects.none')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {create.isError && <p role="alert" className="text-sm text-danger">{t('tasks.createFailed')}</p>}
        <ModalActions>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('chat.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{t('tasks.create')}</Button>
        </ModalActions>
      </form>
    </Modal>
  )
}
