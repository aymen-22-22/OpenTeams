import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const EVERYONE = 'channel'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The "@partial" being typed just before the caret, if any. */
export function mentionQuery(draft: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(draft.slice(0, caret))
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null
}

/** Render @Name and @channel as highlighted chips; mentions of me stand out. */
export function renderMentions(body: string, names: string[], myName: string): ReactNode[] {
  const all = [...names, EVERYONE].sort((a, b) => b.length - a.length).map(escape)
  if (all.length === 0) return [body]
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])@(${all.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  const parts: ReactNode[] = []
  let last = 0
  for (const m of body.matchAll(re)) {
    const index = m.index ?? 0
    if (index > last) parts.push(body.slice(last, index))
    const target = m[1].toLowerCase()
    const isMe = target === myName.toLowerCase() || target === EVERYONE
    parts.push(
      <span key={index} className={cn('rounded px-0.5 font-semibold', isMe ? 'bg-amber-200 text-amber-950' : 'underline decoration-dotted')}>
        {m[0]}
      </span>,
    )
    last = index + m[0].length
  }
  if (last < body.length) parts.push(body.slice(last))
  return parts
}
