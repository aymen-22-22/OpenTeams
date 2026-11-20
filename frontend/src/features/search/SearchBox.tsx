import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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

export function SearchBox({ onOpen }: { onOpen: (message: Message) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  const results = useQuery({
    queryKey: ['search', term],
    queryFn: () => api<{ messages: Message[] }>(`/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  })
  const open = q.trim().length >= 2 && term.length >= 2 && results.isSuccess

  return (
    <div className="relative ms-4 hidden flex-1 md:block">
      <input type="search" aria-label={t('app.search')} placeholder={t('app.search')} value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        className="min-h-11 w-full rounded-md border border-border bg-background px-3" />
      {open && (
        <ul role="listbox" aria-label={t('search.results')}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {results.data.messages.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t('search.noResults')}</li>}
          {results.data.messages.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button type="button" dir="auto" className="min-h-11 w-full truncate px-3 py-2 text-start text-sm hover:bg-muted"
                onClick={() => { onOpen(m); setQ('') }}>
                {m.body}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
