import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

/** Radix defaults to left-to-right; follow the current language instead (Arabic is RTL). */
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  const { i18n } = useTranslation()
  return <TabsPrimitive.Root dir={i18n.dir()} {...props} />
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex gap-1 border-b border-border px-3', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative min-h-11 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
        'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity',
        'data-[state=active]:text-foreground data-[state=active]:after:opacity-100',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('flex-1 animate-fade-in overflow-y-auto p-4 focus-visible:outline-none', className)} {...props} />
}
