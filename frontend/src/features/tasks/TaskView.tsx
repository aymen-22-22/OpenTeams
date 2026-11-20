import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
}

/** A task with its own chat and files, separate from the general conversation. */
export function TaskView({ taskId, meId, people, onBack }: Props) {
  const { t } = useTranslation()
  const task = useTask(taskId).data
  const conversation = useTaskConversation(task?.conversation_id).data
  const move = useMoveTask()

  if (!task) return null
  return (
    <section aria-label={task.title} className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Button variant="ghost" onClick={onBack} aria-label={t('tasks.back')}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 dir="auto" className="truncate font-semibold">{task.title}</h2>
          <span className="text-xs text-muted-foreground">
            {people.get(task.assignee_id ?? '')?.display_name}
            {task.due_date && ` · ${task.due_date}`}
            {task.overdue && <span className="font-semibold text-red-600"> · {t('tasks.overdue')}</span>}
          </span>
        </div>
        <select aria-label={t('tasks.status')} value={task.status}
          onChange={(e) => move.mutate({ id: task.id, status: e.target.value as TaskStatus, after_id: null })}
          className="min-h-11 rounded-md border border-border bg-background px-2">
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
