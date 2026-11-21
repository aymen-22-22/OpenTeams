import { Hash, Lock } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useChannels, useJoinLeave } from './api'

/** All public channels (and my private ones), with Join / Open. */
export function BrowseChannels({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useTranslation()
  const channels = useChannels().data ?? []
  const joinLeave = useJoinLeave()
  return (
    <section aria-label={t('channels.browse')} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-5">
      <header className="flex items-center justify-between">
        <h2 className="page-title">{t('channels.browse')}</h2>
        <Button onClick={onNew}>{t('channels.new')}</Button>
      </header>
      {channels.length === 0 && <EmptyState icon={Hash} title={t('channels.empty')} />}
      <ul className="flex flex-col gap-2">
        {channels.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 shadow-xs">
            {c.is_private ? <Lock className="size-4" aria-hidden /> : <Hash className="size-4" aria-hidden />}
            <span className="flex min-w-0 flex-1 flex-col">
              <span dir="auto" className="truncate font-medium">{c.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t('channels.members', { count: c.member_count })}{c.description && ` · ${c.description}`}
              </span>
            </span>
            {c.joined ? (
              <Button variant="outline" onClick={() => onOpen(c.id)}>{t('channels.open')}</Button>
            ) : (
              <Button onClick={() => joinLeave.mutate({ id: c.id, action: 'join' }, { onSuccess: () => onOpen(c.id) })}>{t('channels.join')}</Button>
            )}
          </li>
        ))}
      </ul>
      </div>
    </section>
  )
}
