import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person } from '@/features/auth/api'
import { realtime } from '@/lib/realtime'

import {
  useDeleteMessage,
  useEditMessage,
  useMarkRead,
  useMessages,
  usePins,
  useSendMessage,
  useTogglePin,
  type Conversation,
  type Message,
} from './api'
import { EVERYONE, mentionQuery } from './mentions'
import { MessageItem } from './MessageItem'
import { useTypingUser } from './typing'

const TYPING_EVERY_MS = 3000

interface Props {
  conversation: Conversation
  meId: string
  people: Map<string, Person>
  onCreateTask?: (message: Message) => void
  onRemind?: (message: Message) => void
}

export function ChatView({ conversation, meId, people, onCreateTask, onRemind }: Props) {
  const { t } = useTranslation()
  const messages = useMessages(conversation.id)
  const pins = usePins(conversation.id)
  const send = useSendMessage(conversation.id)
  const edit = useEditMessage()
  const remove = useDeleteMessage()
  const togglePin = useTogglePin(conversation.id)
  const markRead = useMarkRead(conversation.id)
  const typingUser = useTypingUser(conversation.id)

  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [caret, setCaret] = useState(0)
  const [pick, setPick] = useState(0)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const lastTypingSent = useRef(0)
  const lastReadSent = useRef(conversation.last_read_seq)
  const listRef = useRef<HTMLOListElement>(null)

  // Pages are newest first; display oldest first.
  const items = useMemo(
    () => [...(messages.data?.pages ?? [])].reverse().flatMap((p) => p.items),
    [messages.data],
  )
  const byId = useMemo(() => new Map(items.map((m) => [m.id, m])), [items])
  const pinnedIds = useMemo(() => new Set(pins.data?.map((p) => p.message.id)), [pins.data])
  const lastSeq = items.at(-1)?.seq ?? 0

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight })
    if (lastSeq > lastReadSent.current && !document.hidden) {
      lastReadSent.current = lastSeq
      markRead.mutate(lastSeq)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when a new message arrives
  }, [lastSeq])

  // Names that can be @mentioned here: the other members (and @channel in channels).
  const memberNames = conversation.member_ids
    .filter((id) => id !== meId)
    .map((id) => people.get(id)?.display_name)
    .filter((n): n is string => Boolean(n))
  const mention = mentionQuery(draft, caret)
  const suggestions = mention
    ? [...memberNames, ...(conversation.type === 'channel' ? [EVERYONE] : [])]
        .filter((n) => n.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 6)
    : []
  const insertMention = (name: string) => {
    if (!mention) return
    const next = `${draft.slice(0, mention.start)}@${name} ${draft.slice(caret)}`
    const pos = mention.start + name.length + 2
    setDraft(next)
    setCaret(pos)
    setPick(0)
    requestAnimationFrame(() => textRef.current?.setSelectionRange(pos, pos))
  }

  const nameOf = (id: string | null) => (id === meId ? t('chat.you') : (people.get(id ?? '')?.display_name ?? '?'))

  const onDraftChange = (value: string) => {
    setDraft(value)
    if (Date.now() - lastTypingSent.current > TYPING_EVERY_MS) {
      lastTypingSent.current = Date.now()
      realtime.send({ type: 'typing', conversation_id: conversation.id })
    }
  }

  const reset = () => {
    setDraft('')
    setReplyTo(null)
    setEditing(null)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    if (editing) edit.mutate({ id: editing.id, body }, { onSuccess: reset })
    else send.mutate({ body, reply_to_id: replyTo?.id, key: crypto.randomUUID() }, { onSuccess: reset })
  }

  const startEdit = (m: Message) => {
    setEditing(m)
    setReplyTo(null)
    setDraft(m.body)
  }

  return (
    <div className="flex h-full flex-col">
      <ol ref={listRef} aria-label={t('tabs.chat')} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.hasNextPage && (
          <li className="self-center">
            <Button variant="outline" onClick={() => void messages.fetchNextPage()}>{t('chat.loadOlder')}</Button>
          </li>
        )}
        {messages.isSuccess && items.length === 0 && (
          <li className="m-auto text-sm text-muted-foreground">{t('chat.empty')}</li>
        )}
        {items.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            mine={m.author_id === meId}
            mentionNames={memberNames}
            myName={people.get(meId)?.display_name ?? ''}
            authorName={nameOf(m.author_id)}
            replyTo={m.reply_to_id ? byId.get(m.reply_to_id) : undefined}
            pinned={pinnedIds.has(m.id)}
            onReply={() => {
              setReplyTo(m)
              setEditing(null)
            }}
            onEdit={() => startEdit(m)}
            onDelete={() => remove.mutate(m.id)}
            onCreateTask={onCreateTask ? () => onCreateTask(m) : undefined}
            onRemind={onRemind ? () => onRemind(m) : undefined}
            onTogglePin={() => togglePin.mutate({ id: m.id, pinned: pinnedIds.has(m.id) })}
          />
        ))}
      </ol>

      <p aria-live="polite" className="min-h-5 px-4 text-xs text-muted-foreground">
        {typingUser && t('chat.typing', { name: nameOf(typingUser) })}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border p-3">
        {(replyTo || editing) && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-sm">
            <span className="flex-1 truncate">
              {editing ? t('chat.editing') : t('chat.replyingTo', { text: replyTo?.body.slice(0, 80) })}
            </span>
            <button type="button" aria-label={t('chat.cancel')} onClick={reset} className="flex size-8 items-center justify-center">
              <X className="size-4" />
            </button>
          </div>
        )}
        {suggestions.length > 0 && (
          <ul id="mention-list" role="listbox" aria-label={t('chat.mentionSomeone')} className="flex flex-col rounded-md border border-border bg-background shadow">
            {suggestions.map((name, i) => (
              <li key={name} role="option" aria-selected={i === pick}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(name) }}
                  className={`min-h-11 w-full px-3 text-start text-sm ${i === pick ? 'bg-muted' : ''}`}>
                  <bdi>@{name}</bdi>{name === EVERYONE && ` — ${t('chat.everyone')}`}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <textarea
            aria-label={t('chat.placeholder')}
            placeholder={t('chat.placeholder')}
            value={draft}
            rows={1}
            ref={textRef}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="mention-list"
            aria-autocomplete="list"
            onChange={(e) => {
              onDraftChange(e.target.value)
              setCaret(e.target.selectionStart)
              setPick(0)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (suggestions.length > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setPick((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  insertMention(suggestions[pick] ?? suggestions[0])
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) onSubmit(e)
              if (e.key === 'Escape') reset()
            }}
            className="min-h-11 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2"
          />
          <Button type="submit" disabled={send.isPending || edit.isPending}>
            {editing ? t('chat.save') : t('chat.send')}
          </Button>
        </div>
      </form>
    </div>
  )
}
