import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium',
    'transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground shadow-xs hover:bg-accent-hover',
        outline: 'border border-border-strong bg-background text-foreground shadow-xs hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        subtle: 'bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft/70',
        danger: 'bg-danger text-white shadow-xs hover:opacity-90 dark:text-black',
      },
      size: {
        default: '',
        icon: 'px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
