import { useQuery } from '@tanstack/react-query'
import { FolderKanban, KanbanSquare, MessageSquare, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Message } from '@/features/chat/api'
import { api } from '@/lib/api'

const DEBOUNCE_MS = 250

function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [value])
  return debounced
}

interface Hit {
  id: string
  title: string
}

interface Props {
  onOpen: (message: Message) => void
  onNavigate: (link: string) => void
}

export function SearchBox({ onOpen, onNavigate }: Props) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  const results = useQuery({
    queryKey: ['search', term],
    queryFn: () => api<{ messages: Message[]; tasks: Hit[]; projects: Hit[] }>(`/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  })
  const open = q.trim().length >= 2 && term.length >= 2 && results.isSuccess
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+K / ⌘K jumps to the search box from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input ref={inputRef} type="search" aria-label={t('app.search')} placeholder={t('app.search')} value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        className="peer h-10 w-full rounded-xl border border-transparent bg-muted ps-9 pe-16 text-sm transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground hover:bg-muted/70 focus-visible:border-accent focus-visible:bg-background focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden" />
      <kbd aria-hidden className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md border border-border bg-background px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground peer-focus-visible:opacity-0">
        {t('app.searchShortcut')}
      </kbd>
      {open && (
        <ul role="listbox" aria-label={t('search.results')}
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-96 animate-pop overflow-y-auto rounded-xl border border-border bg-background p-1.5 shadow-lg">
          {results.data.messages.length + results.data.tasks.length + results.data.projects.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('search.noResults')}</li>
          )}
          {[...results.data.projects.map((h) => ({ ...h, link: `/projects/${h.id}`, label: t('projects.project'), Icon: FolderKanban })),
            ...results.data.tasks.map((h) => ({ ...h, link: `/tasks/${h.id}`, label: t('tabs.tasks'), Icon: KanbanSquare }))].map((h) => (
            <li key={h.link} role="option" aria-selected={false}>
              <button type="button" dir="auto" className="flex min-h-11 w-full items-center gap-2.5 truncate rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-muted"
                onClick={() => { onNavigate(h.link); setQ('') }}>
                <h.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-xs font-medium text-accent">{h.label}</span>
                <span className="truncate">{h.title}</span>
              </button>
            </li>
          ))}
          {results.data.messages.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button type="button" dir="auto" className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-muted"
                onClick={() => { onOpen(m); setQ('') }}>
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{m.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
