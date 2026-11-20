import { Info, MessageSquare, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePeople, type User } from '@/features/auth/api'
import { useConversations, useDirectConversation, type Message } from '@/features/chat/api'
import { cn } from '@/lib/utils'

import { ConversationArea } from './ConversationArea'
import { PeoplePanel } from './PeoplePanel'
import { SidePanel } from './SidePanel'
import { TopBar } from './TopBar'

type Column = 'people' | 'conversation' | 'details'

const NAV = [
  { id: 'people', Icon: Users },
  { id: 'conversation', Icon: MessageSquare },
  { id: 'details', Icon: Info },
] as const

/** Three columns on desktop; one column at a time with bottom navigation on mobile. */
export function AppShell({ me }: { me: User }) {
  const { t } = useTranslation()
  const allPeople = usePeople().data
  const conversations = useConversations().data
  const [selectedId, setSelectedId] = useState<string>()
  const [column, setColumn] = useState<Column>('conversation')

  const peopleById = useMemo(() => new Map((allPeople ?? []).map((p) => [p.id, p])), [allPeople])
  const people = (allPeople ?? []).filter((p) => p.id !== me.id)
  const person = people.find((p) => p.id === selectedId) ?? people[0]
  const conversation = useDirectConversation(person?.id).data

  // Unread count per person, from their direct conversation with me.
  const unread = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of conversations ?? []) {
      const other = c.type === 'direct' ? c.member_ids.find((id) => id !== me.id) : undefined
      if (other && other !== person?.id) map.set(other, c.unread_count)
    }
    return map
  }, [conversations, me.id, person?.id])

  const openMessage = (m: Message) => {
    const c = conversations?.find((x) => x.id === m.conversation_id)
    const other = c?.member_ids.find((id) => id !== me.id)
    if (other) {
      setSelectedId(other)
      setColumn('conversation')
    }
  }
  const visible = (c: Column) => (column === c ? 'flex' : 'hidden')

  return (
    <div className="flex h-dvh flex-col">
      <TopBar me={me} onOpenMessage={openMessage} />
      <main className="flex flex-1 overflow-hidden">
        <div className={cn(visible('people'), 'w-full flex-col overflow-y-auto border-e border-border md:flex md:w-72')}>
          <PeoplePanel
            people={people}
            unread={unread}
            selectedId={person?.id}
            onSelect={(p) => {
              setSelectedId(p.id)
              setColumn('conversation')
            }}
          />
        </div>
        <div className={cn(visible('conversation'), 'flex-1 flex-col md:flex')}>
          {person && <ConversationArea person={person} conversation={conversation} meId={me.id} people={peopleById} />}
        </div>
        <div className={cn(visible('details'), 'w-full flex-col overflow-y-auto border-s border-border lg:flex lg:w-80')}>
          <SidePanel conversationId={conversation?.id} />
        </div>
      </main>
      <nav aria-label="Navigation" className="flex border-t border-border md:hidden">
        {NAV.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setColumn(id)}
            aria-current={column === id}
            className={cn('flex min-h-14 flex-1 flex-col items-center justify-center text-xs', column === id ? 'text-accent' : 'text-muted-foreground')}
          >
            <Icon className="size-5" aria-hidden />
            {t(`nav.${id}`)}
          </button>
        ))}
      </nav>
    </div>
  )
}
