import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Friendly placeholder for empty lists: an icon, a sentence, optionally an action. */
export function EmptyState({ icon: Icon, title, hint, action, className }: {
  icon: LucideIcon; title: string; hint?: string; action?: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex animate-fade-in flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}
