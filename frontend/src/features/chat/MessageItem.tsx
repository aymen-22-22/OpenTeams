import { BellPlus, ListPlus, Pencil, Pin, PinOff, Reply, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { Message } from './api'
import { renderMentions } from './mentions'

interface Props {
  message: Message
  mine: boolean
  authorName: string
  replyTo: Message | undefined
  pinned: boolean
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  onCreateTask?: () => void
  onRemind?: () => void
  mentionNames?: string[]
  myName?: string
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="flex size-8 items-center justify-center rounded hover:bg-muted">
      {children}
    </button>
  )
}

export function MessageItem({ message, mine, authorName, replyTo, pinned, mentionNames = [], myName = '', ...actions }: Props) {
  const { t, i18n } = useTranslation()
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(message.created_at),
  )

  return (
    <li className={cn('group flex max-w-[80%] flex-col gap-1', mine ? 'ms-auto items-end' : 'me-auto items-start')}>
      <span className="text-xs text-muted-foreground">
        {authorName} · {time}
        {message.edited_at && !message.deleted && ` · ${t('chat.edited')}`}
        {pinned && <Pin className="ms-1 inline size-3" aria-label={t('chat.pinned')} />}
      </span>
      <div className={cn('rounded-lg px-3 py-2', mine ? 'bg-accent text-accent-foreground' : 'bg-muted')}>
        {replyTo && (
          <p dir="auto" className="mb-1 border-s-2 border-current ps-2 text-xs opacity-80">
            {replyTo.deleted ? t('chat.deleted') : replyTo.body.slice(0, 120)}
          </p>
        )}
        {message.deleted ? (
          <em className="opacity-70">{t('chat.deleted')}</em>
        ) : (
          <p dir="auto" className="whitespace-pre-wrap break-words">{renderMentions(message.body, [...mentionNames, myName].filter(Boolean), myName)}</p>
        )}
      </div>
      {!message.deleted && (
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <ActionButton label={t('chat.reply')} onClick={actions.onReply}><Reply className="size-4 rtl:-scale-x-100" /></ActionButton>
          <ActionButton label={pinned ? t('chat.unpin') : t('chat.pin')} onClick={actions.onTogglePin}>
            {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </ActionButton>
          {actions.onRemind && (
            <ActionButton label={t('reminders.remindMe')} onClick={actions.onRemind}><BellPlus className="size-4" /></ActionButton>
          )}
          {actions.onCreateTask && (
            <ActionButton label={t('tasks.fromMessage')} onClick={actions.onCreateTask}><ListPlus className="size-4" /></ActionButton>
          )}
          {mine && (
            <>
              <ActionButton label={t('chat.edit')} onClick={actions.onEdit}><Pencil className="size-4" /></ActionButton>
              <ActionButton label={t('chat.delete')} onClick={actions.onDelete}><Trash2 className="size-4" /></ActionButton>
            </>
          )}
        </div>
      )}
    </li>
  )
}
