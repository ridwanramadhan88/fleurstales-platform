"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 border-border/60 bg-surface-card shadow-ios-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-400 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[92dvh] overflow-y-auto border-b p-5 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top sm:p-6",
        bottom: "inset-x-0 bottom-0 max-h-[94dvh] rounded-t-2xl border-t p-4 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:p-6",
        left: "inset-y-0 left-0 h-full w-full max-w-[calc(100vw-1rem)] border-r p-5 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:w-[min(40rem,88vw)] sm:max-w-none md:w-[min(44rem,72vw)] lg:w-[min(48rem,64vw)] sm:p-6",
        right: "inset-y-0 right-0 h-full w-full max-w-[calc(100vw-1rem)] border-l p-5 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:w-[min(40rem,88vw)] sm:max-w-none md:w-[min(44rem,72vw)] lg:w-[min(48rem,64vw)] sm:p-6",
        responsiveRight: "inset-x-0 bottom-0 max-h-[94dvh] rounded-t-2xl border-t p-4 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:p-5 md:inset-y-0 md:left-auto md:right-0 md:bottom-auto md:h-full md:max-h-dvh md:max-w-none md:rounded-none md:border-l md:border-t-0 md:p-6 md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideCloseButton?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, hideCloseButton = false, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {!hideCloseButton && (
        <SheetPrimitive.Close className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      )}
      {children}
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1.5 pr-11 text-left",
      className,
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end",
      className,
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("font-display text-lg font-semibold leading-6 text-foreground md:text-xl md:leading-7", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("max-w-3xl text-sm leading-5 text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
