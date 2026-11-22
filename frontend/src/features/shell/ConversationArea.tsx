import { CalendarPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Person } from '@/features/auth/api'
import type { Conversation, Message } from '@/features/chat/api'
import { ChatView } from '@/features/chat/ChatView'
import { FilesTab } from '@/features/files/FilesTab'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AIChat } from '@/features/ai/AIChat'
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
  onRemindMessage: (message: Message) => void
  onScheduleMeeting: (conversationId: string) => void
}

export function ConversationArea(props: Props) {
  const { person, conversation, meId, people, tab, onTabChange, onOpenTask, onNewTask } = props
  const { t } = useTranslation()
  const tasks = useTasks(person.id).data ?? []

  return (
    <section aria-label={person.display_name} className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pt-3 pb-1 sm:px-6">
        <Avatar name={person.display_name} id={person.id} size="md" presence={person.presence} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{person.display_name}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t(`people.status.${person.presence}`)}
            {person.ai_active && <><span aria-hidden>·</span><span className="text-ai-foreground">{t('people.aiActive')}</span></>}
          </p>
        </div>
        {conversation && (
          <Button variant="ghost" onClick={() => props.onScheduleMeeting(conversation.id)}>
            <CalendarPlus className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t('calendar.schedule')}</span>
          </Button>
        )}
      </header>
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as ConversationTab)} className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="ai">{t('tabs.ai')}</TabsTrigger>
          <TabsTrigger value="files">{t('tabs.files')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex flex-col overflow-hidden p-0">
          {conversation ? (
            <ChatView conversation={conversation} meId={meId} people={people} onCreateTask={props.onCreateTaskFromMessage} onRemind={props.onRemindMessage} />
          ) : null}
        </TabsContent>

        <TabsContent value="ai" className="flex flex-col overflow-hidden p-0">
          <AIChat key={person.id} ownerId={person.id} ownerName={person.display_name} isSelf={false} />
        </TabsContent>

        <TabsContent value="files">
          {conversation ? <FilesTab conversationId={conversation.id} /> : null}
        </TabsContent>

        <TabsContent value="tasks" className="flex flex-col gap-3">
          <Button className="self-start" onClick={onNewTask}>{t('tasks.new')}</Button>
          <KanbanBoard tasks={tasks} people={people} onOpen={onOpenTask} assigneeId={person.id} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
