import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { useAsk, useThread } from './api'
import { AIBubble } from './AIBubble'

const ERRORS = new Set(['ai_inactive', 'ai_outside_hours', 'rate_limited', 'ai_budget_exceeded', 'ai_provider_error'])

interface Props {
  ownerId: string
  ownerName: string
  isSelf: boolean
}

export function AIChat({ ownerId, ownerName, isSelf }: Props) {
  const { t } = useTranslation()
  const thread = useThread(ownerId)
  const ask = useAsk(ownerId)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const messages = thread.data?.messages ?? []

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight })
  }, [messages.length, ask.isPending])

  if (thread.error instanceof ApiError && thread.error.status === 404) {
    return <p className="p-4 text-sm text-muted-foreground">{t('ai.notAllowed', { name: ownerName })}</p>
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const content = draft.trim()
    if (content) ask.mutate(content, { onSuccess: () => setDraft('') })
  }

  const errorCode = ask.error instanceof ApiError ? ask.error.code : null

  return (
    <div className="flex h-full flex-col">
      <p role="note" className="m-3 rounded-md border border-ai-foreground/30 bg-ai px-3 py-2 text-sm text-ai-foreground">
        {isSelf ? t('ai.selfNotice') : t('ai.notice', { name: ownerName })}
      </p>
      {thread.data && !thread.data.available && (
        <p className="mx-3 text-sm text-muted-foreground">{t('ai.unavailable')}</p>
      )}
      <ol ref={listRef} aria-label={t('tabs.ai')} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((m) => <AIBubble key={m.id} message={m} ownerName={ownerName} />)}
        {ask.isPending && <li className="me-auto text-sm text-ai-foreground">{t('ai.thinking')}</li>}
      </ol>
      {errorCode && (
        <p role="alert" className="px-4 text-sm text-red-600">
          {t(`ai.errors.${ERRORS.has(errorCode) ? errorCode : 'ai_provider_error'}`)}
        </p>
      )}
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
        <textarea
          aria-label={t('ai.placeholder', { name: ownerName })}
          placeholder={t('ai.placeholder', { name: ownerName })}
          value={draft}
          rows={1}
          disabled={thread.data?.available === false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSubmit(e)}
          className="min-h-11 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2"
        />
        <Button type="submit" disabled={ask.isPending || thread.data?.available === false}>{t('chat.send')}</Button>
      </form>
    </div>
  )
}
