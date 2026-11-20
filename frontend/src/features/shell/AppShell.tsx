import { Info, MessageSquare, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePeople, type User } from '@/features/auth/api'
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
  const people = (usePeople().data ?? []).filter((p) => p.id !== me.id)
  const [selectedId, setSelectedId] = useState<string>()
  const [column, setColumn] = useState<Column>('conversation')

  const person = people.find((p) => p.id === selectedId) ?? people[0]
  const visible = (c: Column) => (column === c ? 'flex' : 'hidden')

  return (
    <div className="flex h-dvh flex-col">
      <TopBar me={me} />
      <main className="flex flex-1 overflow-hidden">
        <div className={cn(visible('people'), 'w-full flex-col overflow-y-auto border-e border-border md:flex md:w-72')}>
          <PeoplePanel
            people={people}
            selectedId={person?.id}
            onSelect={(p) => {
              setSelectedId(p.id)
              setColumn('conversation')
            }}
          />
        </div>
        <div className={cn(visible('conversation'), 'flex-1 flex-col md:flex')}>
          {person && <ConversationArea person={person} />}
        </div>
        <div className={cn(visible('details'), 'w-full flex-col overflow-y-auto border-s border-border lg:flex lg:w-80')}>
          <SidePanel />
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
