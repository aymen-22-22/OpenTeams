import { Hash, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Person } from '@/features/auth/api'
import type { Message } from '@/features/chat/api'
import { ChatView } from '@/features/chat/ChatView'
import { FilesTab } from '@/features/files/FilesTab'
import { useTaskConversation } from '@/features/tasks/api'

import { useChannels, useJoinLeave } from './api'

interface Props {
  channelId: string
  meId: string
  people: Map<string, Person>
  onCreateTask: (m: Message) => void
  onRemind: (m: Message) => void
}

/** A group channel: its chat and files. Non-members of a public channel see a "Join" button. */
export function ChannelView({ channelId, meId, people, onCreateTask, onRemind }: Props) {
  const { t } = useTranslation()
  const channel = useChannels().data?.find((c) => c.id === channelId)
  const conversation = useTaskConversation(channel?.joined ? channelId : undefined).data
  const joinLeave = useJoinLeave()
  if (!channel) return null
  const Icon = channel.is_private ? Lock : Hash

  return (
    <section aria-label={`#${channel.name}`} className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h2 dir="auto" className="font-semibold">{channel.name}</h2>
        <span className="text-xs text-muted-foreground">{t('channels.members', { count: channel.member_count })}</span>
        {channel.description && <span dir="auto" className="hidden truncate text-sm text-muted-foreground md:inline">· {channel.description}</span>}
        <div className="ms-auto">
          {channel.joined ? (
            <Button variant="ghost" onClick={() => joinLeave.mutate({ id: channel.id, action: 'leave' })}>{t('channels.leave')}</Button>
          ) : (
            <Button onClick={() => joinLeave.mutate({ id: channel.id, action: 'join' })}>{t('channels.join')}</Button>
          )}
        </div>
      </header>
      {!channel.joined ? (
        <p className="m-auto p-6 text-center text-sm text-muted-foreground">{t('channels.joinHint')}</p>
      ) : (
        <Tabs defaultValue="chat" className="flex flex-1 flex-col overflow-hidden">
          <TabsList>
            <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
            <TabsTrigger value="files">{t('tabs.files')}</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex flex-col overflow-hidden p-0">
            {conversation && <ChatView conversation={conversation} meId={meId} people={people} onCreateTask={onCreateTask} onRemind={onRemind} />}
          </TabsContent>
          <TabsContent value="files"><FilesTab conversationId={channel.id} /></TabsContent>
        </Tabs>
      )}
    </section>
  )
}
