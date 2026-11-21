import { cn } from '@/lib/utils'

/** Grey placeholder shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-shimmer rounded-md bg-muted', className)} />
}
