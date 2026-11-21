import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  description?: string
  size?: 'sm' | 'md' | 'lg'
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' } as const

/**
 * Accessible dialog: fades in, closes with Escape or a click on the backdrop,
 * moves focus inside on open and gives it back on close.
 */
export function Modal({ title, onClose, children, description, size = 'md' }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button:not([data-close])')
    first?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cn('relative flex max-h-[92dvh] w-full animate-scale-in flex-col overflow-hidden rounded-t-2xl bg-background shadow-lg sm:rounded-2xl', WIDTH[size])}>
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button type="button" data-close onClick={onClose} aria-label={t('calendar.close')}
            className="-me-2 -mt-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/** Footer row for modal forms: actions aligned to the end. */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="-mx-5 -mb-4 mt-5 flex justify-end gap-2 border-t border-border bg-sidebar px-5 py-3">{children}</div>
}
