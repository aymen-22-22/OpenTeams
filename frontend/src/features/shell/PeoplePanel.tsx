import { Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { Person, Presence } from '@/features/auth/api'

const DOT: Record<Presence, string> = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-neutral-400',
}

interface Props {
  people: Person[]
  selectedId: string | undefined
  onSelect: (person: Person) => void
}

export function PeoplePanel({ people, selectedId, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('people.title')} className="flex h-full flex-col gap-2 p-2">
      <button type="button" className="flex min-h-11 items-center gap-2 rounded-md px-2 text-start font-medium text-accent hover:bg-muted">
        <Bot className="size-5" aria-hidden />
        {t('people.myAssistant')}
      </button>

      <h2 className="px-2 pt-2 text-xs font-semibold uppercase text-muted-foreground">{t('people.title')}</h2>
      <ul className="flex flex-col gap-1">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onSelect(person)}
              aria-current={person.id === selectedId}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-start hover:bg-muted',
                person.id === selectedId && 'bg-muted',
              )}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', DOT[person.presence])} aria-label={t(`people.status.${person.presence}`)} />
              <span className="min-w-0 flex-1 truncate">{person.display_name}</span>
              <span className={cn('shrink-0 rounded px-1.5 text-xs', person.ai_active ? 'bg-ai text-ai-foreground' : 'bg-muted text-muted-foreground')}>
                {t(person.ai_active ? 'people.aiActive' : 'people.aiInactive')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {people.length === 0 && <p className="px-2 text-sm text-muted-foreground">{t('people.empty')}</p>}
    </nav>
  )
}
