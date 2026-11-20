import { useTranslation } from 'react-i18next'

import type { Person } from '@/features/auth/api'

import { useAILog } from './api'
import { AIBubble } from './AIBubble'

/** Everything anyone asked my AI, and what it answered. */
export function AILog({ people, ownerName }: { people: Map<string, Person>; ownerName: string }) {
  const { t } = useTranslation()
  const threads = useAILog().data ?? []
  if (threads.length === 0) return <p className="text-sm text-muted-foreground">{t('ai.log.empty')}</p>
  return (
    <div className="flex flex-col gap-6">
      {threads.map((thread) => (
        <section key={thread.caller_id} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{people.get(thread.caller_id)?.display_name ?? '?'}</h3>
          <ol className="flex flex-col gap-2">
            {thread.messages.map((m) => <AIBubble key={m.id} message={m} ownerName={ownerName} />)}
          </ol>
        </section>
      ))}
    </div>
  )
}
