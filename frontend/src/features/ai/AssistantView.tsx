import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Person, User } from '@/features/auth/api'

import { AIChat } from './AIChat'
import { AILog } from './AILog'
import { AISettings } from './AISettings'
import { useAIProfile } from './api'

/** "My assistant": talk to my own AI, configure it, read its log. */
export function AssistantView({ me, people }: { me: User; people: Map<string, Person> }) {
  const { t } = useTranslation()
  const profile = useAIProfile().data
  const others = [...people.values()].filter((p) => p.id !== me.id)

  return (
    <section aria-label={t('people.myAssistant')} className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3 font-semibold">{t('people.myAssistant')}</header>
      <Tabs defaultValue={profile?.ready === false ? 'settings' : 'chat'} className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="settings">{t('ai.settings.title')}</TabsTrigger>
          <TabsTrigger value="log">{t('ai.log.title')}</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex flex-col overflow-hidden p-0">
          <AIChat ownerId={me.id} ownerName={me.display_name} isSelf />
        </TabsContent>
        <TabsContent value="settings">
          {profile && <AISettings key={String(profile.has_api_key)} profile={profile} people={others} />}
        </TabsContent>
        <TabsContent value="log">
          <AILog people={people} ownerName={me.display_name} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
