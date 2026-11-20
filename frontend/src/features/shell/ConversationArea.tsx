import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { FileIcon } from './FileIcon'
import { FILES, ME, MESSAGES, TASK_COUNTS, type Person, type TaskStatus } from './placeholder'

const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'finished']

export function ConversationArea({ person }: { person: Person }) {
  const { t } = useTranslation()

  return (
    <section aria-label={person.name} className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3 font-semibold">{person.name}</header>
      <Tabs defaultValue="chat" className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="ai">{t('tabs.ai')}</TabsTrigger>
          <TabsTrigger value="files">{t('tabs.files')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex flex-col gap-2">
          {MESSAGES.map((m) => (
            <p key={m.id} className={cn('max-w-[75%] rounded-lg px-3 py-2', m.authorId === ME ? 'ms-auto bg-accent text-accent-foreground' : 'me-auto bg-muted')}>
              {m.text}
            </p>
          ))}
          <form className="mt-auto flex gap-2 pt-4" onSubmit={(e) => e.preventDefault()}>
            <input aria-label={t('chat.placeholder')} placeholder={t('chat.placeholder')} className="min-h-11 flex-1 rounded-md border border-border bg-background px-3" />
            <Button type="submit">{t('chat.send')}</Button>
          </form>
        </TabsContent>

        <TabsContent value="ai" className="flex flex-col gap-2">
          <p role="note" className="rounded-md border border-ai-foreground/30 bg-ai px-3 py-2 text-sm text-ai-foreground">
            {t('ai.notice', { name: person.name })}
          </p>
          <div className="me-auto max-w-[75%] rounded-lg bg-ai px-3 py-2 text-ai-foreground">
            <span className="block text-xs font-semibold">{t('ai.label', { name: person.name })}</span>
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
