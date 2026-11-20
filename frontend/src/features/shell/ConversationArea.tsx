import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Person } from '@/features/auth/api'
import type { Conversation, Message } from '@/features/chat/api'
import { ChatView } from '@/features/chat/ChatView'
import { FilesTab } from '@/features/files/FilesTab'

import { Button } from '@/components/ui/button'
import type { Task } from '@/features/tasks/api'
import { useTasks } from '@/features/tasks/api'
import { KanbanBoard } from '@/features/tasks/KanbanBoard'

export type ConversationTab = 'chat' | 'ai' | 'files' | 'tasks'

interface Props {
  person: Person
  conversation: Conversation | undefined
  meId: string
  people: Map<string, Person>
  tab: ConversationTab
  onTabChange: (tab: ConversationTab) => void
  onOpenTask: (task: Task) => void
  onNewTask: () => void
  onCreateTaskFromMessage: (message: Message) => void
}

export function ConversationArea(props: Props) {
  const { person, conversation, meId, people, tab, onTabChange, onOpenTask, onNewTask } = props
  const { t } = useTranslation()
  const tasks = useTasks(person.id).data ?? []

  return (
    <section aria-label={person.display_name} className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3 font-semibold">{person.display_name}</header>
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as ConversationTab)} className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="ai">{t('tabs.ai')}</TabsTrigger>
          <TabsTrigger value="files">{t('tabs.files')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex flex-col overflow-hidden p-0">
          {conversation ? (
            <ChatView conversation={conversation} meId={meId} people={people} onCreateTask={props.onCreateTaskFromMessage} />
          ) : null}
        </TabsContent>

        <TabsContent value="ai" className="flex flex-col gap-2">
          <p role="note" className="rounded-md border border-ai-foreground/30 bg-ai px-3 py-2 text-sm text-ai-foreground">
            {t('ai.notice', { name: person.display_name })}
          </p>
          <div className="me-auto max-w-[75%] rounded-lg bg-ai px-3 py-2 text-ai-foreground">
            <span className="block text-xs font-semibold">{t('ai.label', { name: person.display_name })}</span>
            …
          </div>
        </TabsContent>

        <TabsContent value="files">
          {conversation ? <FilesTab conversationId={conversation.id} /> : null}
        </TabsContent>

        <TabsContent value="tasks" className="flex flex-col gap-3">
          <Button className="self-start" onClick={onNewTask}>{t('tasks.new')}</Button>
          <KanbanBoard tasks={tasks} people={people} onOpen={onOpenTask} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
