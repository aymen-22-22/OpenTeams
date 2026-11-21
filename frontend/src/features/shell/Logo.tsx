import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

/** Brand mark: two overlapping speech bubbles in the accent colour, and the product name. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-accent-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 15.5V6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3.5" />
          <path d="M19.5 9.5h.5a1.5 1.5 0 0 1 1.5 1.5v9l-3-2.5H12a1.5 1.5 0 0 1-1.5-1.5v-.5" opacity="0.7" />
        </svg>
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">{t('app.name')}</span>}
    </span>
  )
}
