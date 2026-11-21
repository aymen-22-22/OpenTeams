import { Hash, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useChannels, useJoinLeave } from './api'

/** All public channels (and my private ones), with Join / Open. */
export function BrowseChannels({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useTranslation()
  const channels = useChannels().data ?? []
  const joinLeave = useJoinLeave()
  return (
    <section aria-label={t('channels.browse')} className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('channels.browse')}</h2>
        <Button onClick={onNew}>{t('channels.new')}</Button>
      </header>
      {channels.length === 0 && <p className="text-sm text-muted-foreground">{t('channels.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {channels.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border border-border p-3">
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
    </section>
  )
}
