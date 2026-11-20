import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { FileIcon } from './FileIcon'
import type { Person } from '@/features/auth/api'
import type { Conversation } from '@/features/chat/api'
import { ChatView } from '@/features/chat/ChatView'

import { FILES, TASK_COUNTS, type TaskStatus } from './placeholder'

const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'finished']

interface Props {
  person: Person
  conversation: Conversation | undefined
  meId: string
  people: Map<string, Person>
}

export function ConversationArea({ person, conversation, meId, people }: Props) {
  const { t } = useTranslation()

  return (
    <section aria-label={person.display_name} className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3 font-semibold">{person.display_name}</header>
      <Tabs defaultValue="chat" className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="ai">{t('tabs.ai')}</TabsTrigger>
          <TabsTrigger value="files">{t('tabs.files')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex flex-col overflow-hidden p-0">
          {conversation ? <ChatView conversation={conversation} meId={meId} people={people} /> : null}
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
          <div className="flex flex-wrap gap-2">
            {FILES.map((f) => <FileIcon key={f.id} file={f} />)}
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <div className="grid gap-3 md:grid-cols-3">
            {STATUSES.map((s) => (
              <div key={s} className="rounded-md border border-border p-3">
                <h3 className="font-medium">{t(`tasks.${s}`)}</h3>
                <p className="text-2xl font-semibold">{TASK_COUNTS[s]}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
