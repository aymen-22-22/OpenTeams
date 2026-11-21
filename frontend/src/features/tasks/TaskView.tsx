import { ArrowLeft, BellPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Person } from '@/features/auth/api'
import { ChatView } from '@/features/chat/ChatView'
import { FilesTab } from '@/features/files/FilesTab'

import { STATUSES, useMoveTask, useTask, useTaskConversation, type TaskStatus } from './api'

interface Props {
  taskId: string
  meId: string
  people: Map<string, Person>
  onBack: () => void
  onRemind: (taskId: string, title: string) => void
}

/** A task with its own chat and files, separate from the general conversation. */
export function TaskView({ taskId, meId, people, onBack, onRemind }: Props) {
  const { t } = useTranslation()
  const task = useTask(taskId).data
  const conversation = useTaskConversation(task?.conversation_id).data
  const move = useMoveTask()

  if (!task) return null
  return (
    <section aria-label={task.title} className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-2 pt-2 pb-1 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('tasks.back')}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 dir="auto" className="truncate text-[15px] font-semibold">{task.title}</h2>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {task.assignee_id && people.get(task.assignee_id) && (
              <span className="flex items-center gap-1.5">
                <Avatar name={people.get(task.assignee_id)!.display_name} id={task.assignee_id} size="xs" />
                {people.get(task.assignee_id)!.display_name}
              </span>
            )}
            {task.due_date && <Badge tone={task.overdue ? 'danger' : 'neutral'}>{task.due_date}{task.overdue && ` · ${t('tasks.overdue')}`}</Badge>}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onRemind(task.id, task.title)} aria-label={t('reminders.remindMe')} title={t('reminders.remindMe')}>
          <BellPlus className="size-5" aria-hidden />
        </Button>
        <select aria-label={t('tasks.status')} value={task.status}
          onChange={(e) => move.mutate({ id: task.id, status: e.target.value as TaskStatus, after_id: null })}
          className="field">
          {STATUSES.map((s) => <option key={s} value={s}>{t(`tasks.${s}`)}</option>)}
        </select>
      </header>
      <Tabs defaultValue="chat" className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="files">{t('tabs.files')}</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex flex-col overflow-hidden p-0">
          {conversation && <ChatView conversation={conversation} meId={meId} people={people} />}
        </TabsContent>
        <TabsContent value="files">
          <FilesTab conversationId={task.conversation_id} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
