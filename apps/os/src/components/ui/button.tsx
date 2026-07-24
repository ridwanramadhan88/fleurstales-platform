import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-ios-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-ios-sm hover:bg-destructive/90",
        outline:
          "border border-border bg-surface-card text-foreground shadow-ios-sm hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        tinted:
          "bg-primary/10 text-primary hover:bg-primary/15",
        ghost:
          "text-foreground hover:bg-accent",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-11 px-[18px] text-sm",
        md: "h-11 px-[18px] text-sm",
        default: "h-11 px-[18px] text-sm",
        lg: "h-11 px-[18px] text-sm",
        icon: "size-11 rounded-full p-0",
        "icon-sm": "size-11 rounded-full p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
