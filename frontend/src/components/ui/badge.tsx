import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  ai: 'bg-ai text-ai-foreground',
} as const

export type Tone = keyof typeof TONES

export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)} {...props} />
}
