import { Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { AIMessage } from './api'

/** AI answers always carry the "AI of <name>" label and a distinct purple style. */
export function AIBubble({ message, ownerName }: { message: AIMessage; ownerName: string }) {
  const { t } = useTranslation()
  const isAI = message.role === 'assistant'
  return (
    <li className={cn('flex max-w-[80%] flex-col gap-1', isAI ? 'me-auto items-start' : 'ms-auto items-end')}>
      {isAI && (
        <span className="flex items-center gap-1 text-xs font-semibold text-ai-foreground">
          <Bot className="size-3" aria-hidden />
          {t('ai.label', { name: ownerName })}
        </span>
      )}
      <p dir="auto" className={cn(
        'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed',
        isAI ? 'rounded-ss-md border border-ai-border bg-ai text-ai-foreground shadow-xs' : 'rounded-se-md bg-accent text-accent-foreground shadow-xs',
      )}>
        {message.content}
      </p>
    </li>
  )
}
