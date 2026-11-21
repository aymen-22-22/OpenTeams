import { BellPlus, ListPlus, Pencil, Pin, PinOff, Reply, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

import type { Message } from './api'
import { renderMentions } from './mentions'

interface Props {
  message: Message
  mine: boolean
  authorName: string
  replyTo: Message | undefined
  pinned: boolean
  grouped?: boolean // same author a moment ago: no avatar or name again
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  onCreateTask?: () => void
  onRemind?: () => void
  mentionNames?: string[]
  myName?: string
}

function ActionButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cn('flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', danger && 'hover:bg-danger-soft hover:text-danger')}>
      {children}
    </button>
  )
}

export function MessageItem({ message, mine, authorName, replyTo, pinned, grouped = false, mentionNames = [], myName = '', ...actions }: Props) {
  const { t, i18n } = useTranslation()
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))

  return (
    <li className={cn('group relative flex animate-fade-up gap-2.5', mine ? 'flex-row-reverse' : 'flex-row', grouped ? 'mt-1' : 'mt-4')}>
      {/* Avatar column (others only) keeps grouped messages aligned */}
      {!mine && (
        <span className="w-8 shrink-0">
          {!grouped && <Avatar name={authorName} id={message.author_id ?? undefined} size="sm" />}
        </span>
      )}

      <div className={cn('relative flex max-w-[min(80%,40rem)] min-w-0 flex-col gap-1', mine ? 'items-end' : 'items-start')}>
        {!grouped && (
          <span className="flex items-baseline gap-2 px-1 text-xs">
            {!mine && <span className="font-semibold text-foreground">{authorName}</span>}
            <span className="text-muted-foreground">{time}</span>
          </span>
        )}
        <span className="sr-only">{grouped && `${authorName} · ${time}`}</span>

        <div title={grouped ? time : undefined}
          className={cn(
            'relative rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-xs',
            mine ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground',
            !grouped && (mine ? 'rounded-se-md' : 'rounded-ss-md'),
            pinned && 'ring-2 ring-amber-400/70',
          )}>
          {replyTo && (
            <p dir="auto" className={cn('mb-1.5 line-clamp-2 border-s-2 ps-2 text-[13px]', mine ? 'border-white/60 text-white/85 dark:border-black/40 dark:text-black/70' : 'border-accent text-muted-foreground')}>
              {replyTo.deleted ? t('chat.deleted') : replyTo.body.slice(0, 160)}
            </p>
          )}
          {message.deleted ? (
            <em className="opacity-70">{t('chat.deleted')}</em>
          ) : (
            <p dir="auto" className="whitespace-pre-wrap break-words">
              {renderMentions(message.body, [...mentionNames, myName].filter(Boolean), myName)}
            </p>
          )}
        </div>
        {(message.edited_at && !message.deleted) || pinned ? (
          <span className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            {pinned && <><Pin className="size-3 text-amber-600" aria-hidden /><span>{t('chat.pinned')}</span></>}
            {message.edited_at && !message.deleted && <span>{t('chat.edited')}</span>}
          </span>
        ) : null}
        {/* Floating toolbar: appears on hover or keyboard focus */}
        {!message.deleted && (
          <div className={cn(
            'absolute top-0 z-10 flex items-center gap-0.5 rounded-xl border border-border bg-background p-0.5 shadow-md',
            'pointer-events-none opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
            // Beside the bubble, on the free side, so it never covers other messages.
            mine ? 'end-full me-2' : 'start-full ms-2',
          )}>
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
                <ActionButton label={t('chat.delete')} onClick={actions.onDelete} danger><Trash2 className="size-4" /></ActionButton>
              </>
            )}
          </div>
        )}
      </div>

    </li>
  )
}
