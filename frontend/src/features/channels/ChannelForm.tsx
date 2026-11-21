import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Modal, ModalActions } from '@/components/ui/modal'
import type { Person } from '@/features/auth/api'
import { ApiError } from '@/lib/api'

import { useCreateChannel, type Channel } from './api'

const field = 'field'

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
    <Modal title={t('channels.new')} onClose={() => onDone()}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('channels.name')}
          <input required autoFocus maxLength={80} pattern="[^#@\s][^#@]*" value={name} onChange={(e) => setName(e.target.value)}
            className={field} dir="auto" placeholder={t('channels.namePlaceholder')} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('calendar.description')}
          <input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={field} dir="auto" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
          {t('channels.private')}
        </label>
        <fieldset className="flex flex-col rounded-xl border border-border bg-background p-4 shadow-xs">
          <legend className="px-1 text-sm font-semibold">{t('channels.invite')}</legend>
          {people.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={members.includes(p.id)}
                onChange={(e) => setMembers((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))} />
              {p.display_name}
            </label>
          ))}
        </fieldset>
        {create.isError && <p role="alert" className="text-sm text-danger">{t(taken ? 'channels.taken' : 'channels.failed')}</p>}
        <ModalActions>
          <Button type="button" variant="ghost" onClick={() => onDone()}>{t('chat.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{t('tasks.create')}</Button>
        </ModalActions>
      </form>
    </Modal>
  )
}
