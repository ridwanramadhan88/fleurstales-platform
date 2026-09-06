"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

export type TabLevel = "primary" | "secondary"

export const tabButtonClass = ({
  active,
  level = "primary",
  segmented = false,
  className,
}: {
  active: boolean
  level?: TabLevel
  segmented?: boolean
  className?: string
}) =>
  cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50",
    level === "primary" ? "h-11 px-[18px]" : "h-9 px-3.5",
    // Pill everywhere (Apple ladder). Segmented lives inside a grey track and
    // has no own border; standalone keeps a hairline border for definition.
    segmented ? "rounded-full" : "rounded-full border",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : segmented
        ? "text-muted-foreground hover:bg-surface-card hover:text-foreground"
        : "border-border bg-surface-card text-muted-foreground hover:bg-accent hover:text-foreground",
    className,
  )


const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex min-h-11 items-center justify-center gap-1 rounded-full bg-surface-track p-1 text-muted-foreground ring-1 ring-border/60",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface-card data-[state=active]:text-foreground data-[state=active]:shadow-ios-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
