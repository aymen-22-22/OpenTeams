import { cn } from '@/lib/utils'

/** Calm, readable colours for initials (white text passes AA on each). */
const COLORS = ['bg-teal-700', 'bg-sky-700', 'bg-indigo-600', 'bg-violet-700', 'bg-rose-700', 'bg-amber-700', 'bg-emerald-700', 'bg-slate-600']
const DOT = { online: 'bg-green-500', away: 'bg-amber-500', offline: 'bg-neutral-400' } as const
const SIZES = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-9 text-sm', lg: 'size-11 text-base' } as const

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

interface Props {
  name: string
  id?: string
  size?: keyof typeof SIZES
  presence?: keyof typeof DOT
  presenceLabel?: string
  className?: string
}

/** Initials avatar with a stable colour per person and an optional presence dot. */
export function Avatar({ name, id, size = 'md', presence, presenceLabel, className }: Props) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span aria-hidden className={cn('inline-flex items-center justify-center rounded-full font-semibold text-white select-none', SIZES[size], COLORS[hash(id ?? name) % COLORS.length])}>
        {initials(name)}
      </span>
      {presence && (
        <span aria-label={presenceLabel} role={presenceLabel ? 'img' : undefined}
          className={cn('absolute -bottom-0.5 -end-0.5 size-3 rounded-full ring-2 ring-[var(--avatar-ring,var(--background))] transition-colors', DOT[presence])} />
      )}
    </span>
  )
}
