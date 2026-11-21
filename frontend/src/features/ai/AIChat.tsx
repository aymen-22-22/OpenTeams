import { Info, SendHorizontal, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
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
      <p role="note" className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl border border-ai-border bg-ai px-3.5 py-2.5 text-sm text-ai-foreground sm:mx-6">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {isSelf ? t('ai.selfNotice') : t('ai.notice', { name: ownerName })}
      </p>
      {thread.data && !thread.data.available && (
        isSelf ? (
          <EmptyState icon={Sparkles} title={t('ai.notConfigured')} hint={t('ai.notConfiguredHint')} className="flex-1" />
        ) : (
          <p className="mx-4 mt-2 text-sm text-muted-foreground sm:mx-6">{t('ai.unavailable')}</p>
        )
      )}
      <ol ref={listRef} aria-label={t('tabs.ai')} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.map((m) => <AIBubble key={m.id} message={m} ownerName={ownerName} />)}
        {ask.isPending && (
          <li className="me-auto flex animate-fade-in items-center gap-2 rounded-2xl border border-ai-border bg-ai px-3.5 py-2.5 text-sm text-ai-foreground">
            <span className="inline-flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-typing rounded-full bg-current" style={{ animationDelay: `${i * 150}ms` }} />)}
            </span>
            {t('ai.thinking')}
          </li>
        )}
      </ol>
      {errorCode && (
        <p role="alert" className="px-4 text-sm text-danger">
          {t(`ai.errors.${ERRORS.has(errorCode) ? errorCode : 'ai_provider_error'}`)}
        </p>
      )}
      <form onSubmit={onSubmit} className="mx-3 mb-3 flex items-end gap-2 rounded-2xl border border-border-strong bg-background p-1.5 ps-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-ai-foreground/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ai-foreground)_15%,transparent)] sm:mx-5 sm:mb-4">
        <textarea
          aria-label={t('ai.placeholder', { name: ownerName })}
          placeholder={t('ai.placeholder', { name: ownerName })}
          value={draft}
          rows={1}
          disabled={thread.data?.available === false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSubmit(e)}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <Button type="submit" size="icon" className="rounded-xl bg-ai-foreground text-background hover:bg-ai-foreground/90" disabled={ask.isPending || thread.data?.available === false || !draft.trim()}
          aria-label={t('chat.send')} title={t('chat.send')}>
          <SendHorizontal className="size-[18px] rtl:-scale-x-100" aria-hidden />
        </Button>
      </form>
    </div>
  )
}
