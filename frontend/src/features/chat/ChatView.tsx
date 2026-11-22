import { MessagesSquare, Paperclip, Reply, Pencil, SendHorizontal, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import type { Person } from '@/features/auth/api'
import { filesKey, uploadFile } from '@/features/files/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
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
const GROUP_GAP_MS = 5 * 60_000 // messages by the same person within 5 minutes share one header
const KNOWN_UPLOAD_ERRORS = new Set(['type_not_allowed', 'too_large', 'rejected'])

/** A file chosen in the composer, uploaded when the message is sent. */
interface Attachment {
  id: string
  file: File
  progress: number | null // null: not started
  error?: string
}

/** "12 ko" / "12 kB" / "١٢ ك.ب", in the user's language. */
function formatSize(bytes: number, lang: string) {
  const [value, unit] = bytes < 1024 * 1024 ? [Math.max(1, Math.round(bytes / 1024)), 'kilobyte'] : [bytes / 1024 / 1024, 'megabyte']
  return new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value)
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** "Aujourd'hui", "Hier" or a full date, in the user's language. */
function DaySeparator({ iso }: { iso: string }) {
  const { t, i18n } = useTranslation()
  const date = new Date(iso)
  const [now] = useState(() => Date.now()) // read once: rendering stays pure
  const today = new Date(now)
  const yesterday = new Date(now - 86_400_000)
  const label = date.toDateString() === today.toDateString() ? t('chat.today')
    : date.toDateString() === yesterday.toDateString() ? t('chat.yesterday')
    : new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return (
    <li className="my-2 flex items-center gap-3 text-xs font-medium text-muted-foreground">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span role="separator" aria-label={label} className="rounded-full border border-border bg-background px-2.5 py-0.5 capitalize">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </li>
  )
}

function MessagesSkeleton() {
  return (
    <li aria-hidden className="flex flex-col gap-5 py-2">
      {[0.6, 0.4, 0.7].map((w, i) => (
        <span key={i} className={`flex items-end gap-2 ${i === 1 ? 'flex-row-reverse' : ''}`}>
          {i !== 1 && <Skeleton className="size-8 rounded-full" />}
          <Skeleton className="h-10 rounded-2xl" />
          <span style={{ inlineSize: `${w * 100}%` }} />
        </span>
      ))}
    </li>
  )
}

interface Props {
  conversation: Conversation
  meId: string
  people: Map<string, Person>
  onCreateTask?: (message: Message) => void
  onRemind?: (message: Message) => void
}

export function ChatView({ conversation, meId, people, onCreateTask, onRemind }: Props) {
  const { t, i18n } = useTranslation()
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
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

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

  const addFiles = (files: File[]) => {
    if (editing || files.length === 0) return
    setAttachments((list) => [...list, ...files.map((file) => ({ id: crypto.randomUUID(), file, progress: null }))])
    textRef.current?.focus()
  }
  const patchAttachment = (id: string, patch: Partial<Attachment>) =>
    setAttachments((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const pending = attachments.filter((a) => !a.error)

  /** Upload the chosen files; returns the names that were stored. Refused ones stay listed with their error. */
  const uploadPending = async (): Promise<string[]> => {
    const stored: string[] = []
    for (const a of pending) {
      try {
        const file = await uploadFile(conversation.id, a.file, (ratio) => patchAttachment(a.id, { progress: ratio }))
        stored.push(file.name)
        setAttachments((list) => list.filter((x) => x.id !== a.id))
      } catch (err) {
        patchAttachment(a.id, { progress: null, error: err instanceof ApiError ? err.code : 'upload_failed' })
      }
    }
    if (stored.length) void qc.invalidateQueries({ queryKey: filesKey(conversation.id) })
    return stored
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (editing) {
      if (text) edit.mutate({ id: editing.id, body: text }, { onSuccess: reset })
      return
    }
    if (!text && pending.length === 0) return
    setUploading(true)
    const names = pending.length ? await uploadPending() : []
    setUploading(false)
    const body = [text, names.length ? `📎 ${names.join(', ')}` : ''].filter(Boolean).join('\n\n')
    if (!body) return // every file was refused: keep the draft and show the errors
    send.mutate({ body, reply_to_id: replyTo?.id, key: crypto.randomUUID() }, { onSuccess: reset })
  }

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files)
    if (files.length) {
      e.preventDefault()
      addFiles(files)
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const startEdit = (m: Message) => {
    setEditing(m)
    setReplyTo(null)
    setDraft(m.body)
  }

  return (
    <div className="relative flex h-full flex-col"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={onDrop}>
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex animate-fade-in items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80">
          <span className="flex items-center gap-2 text-sm font-semibold text-accent-soft-foreground">
            <Upload className="size-5" aria-hidden />{t('chat.dropFiles')}
          </span>
        </div>
      )}
      <ol ref={listRef} aria-label={t('tabs.chat')} className="flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
        {messages.hasNextPage && (
          <li className="self-center">
            <Button variant="outline" onClick={() => void messages.fetchNextPage()}>{t('chat.loadOlder')}</Button>
          </li>
        )}
        {messages.isPending && <MessagesSkeleton />}
        {messages.isSuccess && items.length === 0 && (
          <li className="m-auto"><EmptyState icon={MessagesSquare} title={t('chat.empty')} hint={t('chat.emptyHint')} /></li>
        )}
        {items.map((m, i) => {
          const prev = items[i - 1]
          const newDay = !prev || !sameDay(prev.created_at, m.created_at)
          const grouped = !newDay && !!prev && prev.author_id === m.author_id && !prev.deleted &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS
          return [
            newDay && <DaySeparator key={`day-${m.id}`} iso={m.created_at} />,
          <MessageItem
            key={m.id}
            grouped={grouped}
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
          />,
          ]
        })}
      </ol>

      <p aria-live="polite" className="min-h-6 px-5 text-xs text-muted-foreground sm:px-7">
        {typingUser && (
          <span className="inline-flex animate-fade-in items-center gap-1.5">
            <span className="inline-flex gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => <span key={i} className="size-1 animate-typing rounded-full bg-current" style={{ animationDelay: `${i * 150}ms` }} />)}
            </span>
            {t('chat.typing', { name: nameOf(typingUser) })}
          </span>
        )}
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="relative px-3 pb-3 sm:px-5 sm:pb-4">
        {suggestions.length > 0 && (
          <ul id="mention-list" role="listbox" aria-label={t('chat.mentionSomeone')}
            className="absolute inset-x-3 bottom-full z-10 mb-2 flex animate-pop flex-col overflow-hidden rounded-xl border border-border bg-background p-1 shadow-lg sm:inset-x-5">
            {suggestions.map((name, i) => (
              <li key={name} role="option" aria-selected={i === pick}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(name) }}
                  className={`min-h-11 w-full rounded-lg px-3 text-start text-sm transition-colors ${i === pick ? 'bg-accent-soft text-accent-soft-foreground' : 'hover:bg-muted'}`}>
                  <bdi>@{name}</bdi>{name === EVERYONE && ` — ${t('chat.everyone')}`}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-2xl border border-border-strong bg-background shadow-sm transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]">
        {(replyTo || editing) && (
          <div className="flex animate-fade-in items-center gap-2 border-b border-border px-3 py-1.5 text-sm text-muted-foreground">
            {editing ? <Pencil className="size-3.5 shrink-0 text-accent" aria-hidden /> : <Reply className="size-3.5 shrink-0 text-accent rtl:-scale-x-100" aria-hidden />}
            <span dir="auto" className="flex-1 truncate">
              {editing ? t('chat.editing') : t('chat.replyingTo', { text: replyTo?.body.slice(0, 80) })}
            </span>
            <button type="button" aria-label={t('chat.cancel')} onClick={reset} className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <ul aria-label={t('chat.attachments')} className="flex flex-wrap gap-1.5 border-b border-border p-2">
            {attachments.map((a) => (
              <li key={a.id} className={cn('relative flex min-h-9 max-w-64 items-center gap-2 overflow-hidden rounded-lg border ps-2.5 text-[13px]',
                a.error ? 'border-danger/40 bg-danger-soft text-danger' : 'border-border bg-muted')}>
                <Paperclip className="size-3.5 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col py-1 leading-tight">
                  <span dir="auto" className="truncate font-medium">{a.file.name}</span>
                  <span className={cn('text-[11px]', !a.error && 'text-muted-foreground')}>
                    {a.error ? t(`files.errors.${KNOWN_UPLOAD_ERRORS.has(a.error) ? a.error : 'upload_failed'}`) : formatSize(a.file.size, i18n.language)}
                  </span>
                </span>
                <button type="button" aria-label={t('chat.removeFile', { name: a.file.name })} disabled={uploading}
                  onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-background/60">
                  <X className="size-3.5" aria-hidden />
                </button>
                {a.progress !== null && (
                  <span role="progressbar" aria-label={a.file.name} aria-valuenow={Math.round(a.progress * 100)}
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-accent transition-[inline-size]" style={{ inlineSize: `${a.progress * 100}%` }} />
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1 p-1.5">
          <input ref={fileRef} type="file" multiple hidden aria-label={t('chat.attach')} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(editing)}
            aria-label={t('chat.attach')} title={t('chat.attach')}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
            <Paperclip className="size-[18px]" aria-hidden />
          </button>
          <textarea
            onPaste={onPaste}
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
              if (e.key === 'Enter' && !e.shiftKey) void onSubmit(e)
              if (e.key === 'Escape') reset()
            }}
            onInput={(e) => {
              // Grow with the text, up to about six lines.
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" className="rounded-xl" disabled={uploading || send.isPending || edit.isPending || (!draft.trim() && (editing !== null || pending.length === 0))}
            aria-label={editing ? t('chat.save') : t('chat.send')} title={editing ? t('chat.save') : t('chat.send')}>
            <SendHorizontal className="size-[18px] rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
        </div>
        <p className="mt-1.5 hidden px-1 text-end text-[11px] text-muted-foreground sm:block" aria-hidden>{t('chat.keysHint')}</p>
      </form>
    </div>
  )
}
