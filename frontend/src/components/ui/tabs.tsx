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
  return <TabsPrimitive.List className={cn('flex gap-1 border-b border-border px-2', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'min-h-11 border-b-2 border-transparent px-3 text-sm text-muted-foreground',
        'data-[state=active]:border-accent data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('flex-1 overflow-y-auto p-4', className)} {...props} />
}
