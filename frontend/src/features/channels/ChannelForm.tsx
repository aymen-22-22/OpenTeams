import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'
import { ApiError } from '@/lib/api'

import { useCreateChannel, type Channel } from './api'

const field = 'min-h-11 rounded-md border border-border bg-background px-3'

export function ChannelForm({ people, onDone }: { people: Person[]; onDone: (c?: Channel) => void }) {
  const { t } = useTranslation()
  const create = useCreateChannel()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setPrivate] = useState(false)
  const [members, setMembers] = useState<string[]>([])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate({ name: name.trim(), description, is_private: isPrivate, member_ids: members }, { onSuccess: onDone })
  }
  const taken = create.error instanceof ApiError && create.error.status === 409

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="channel-form-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onKeyDown={(e) => e.key === 'Escape' && onDone()}>
      <form onSubmit={onSubmit} className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg bg-background p-5 shadow-xl">
        <h2 id="channel-form-title" className="text-lg font-semibold">{t('channels.new')}</h2>
        <label className="flex flex-col gap-1 text-sm">{t('channels.name')}
          <input required autoFocus maxLength={80} pattern="[^#@\s][^#@]*" value={name} onChange={(e) => setName(e.target.value)}
            className={field} dir="auto" placeholder={t('channels.namePlaceholder')} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t('calendar.description')}
          <input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={field} dir="auto" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
          {t('channels.private')}
        </label>
        <fieldset className="flex flex-col rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">{t('channels.invite')}</legend>
          {people.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={members.includes(p.id)}
                onChange={(e) => setMembers((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))} />
              {p.display_name}
            </label>
          ))}
        </fieldset>
        {create.isError && <p role="alert" className="text-sm text-red-600">{t(taken ? 'channels.taken' : 'channels.failed')}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onDone()}>{t('chat.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{t('tasks.create')}</Button>
        </div>
      </form>
    </div>
  )
}
