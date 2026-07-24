import type { FC, ReactNode } from 'react'

interface InfoDisclosureProps {
  title: string
  children: ReactNode
  className?: string
  defaultOpen?: boolean
}

/** Compact disclosure for optional, non-blocking helper information. */
export const InfoDisclosure: FC<InfoDisclosureProps> = ({ title, children, className = '', defaultOpen = false }) => (
  <details className={`group text-xs text-muted-foreground ${className}`} open={defaultOpen || undefined}>
    <summary className="inline-flex cursor-pointer list-none items-center rounded-full font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="text-sm leading-none">ⓘ</span>
      <span>{title}</span>
    </summary>
    <div className="mt-2 rounded-xl bg-surface-panel px-3 py-2.5 leading-relaxed text-muted-foreground ring-1 ring-border/60">
      {children}
    </div>
  </details>
)
