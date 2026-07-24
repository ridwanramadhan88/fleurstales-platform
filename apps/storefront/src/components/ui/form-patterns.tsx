import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

export const FormSection = ({
  title,
  description,
  children,
  optional = false,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  optional?: boolean
  className?: string
}) => (
  <section className={cn('space-y-3 rounded-xl border border-border/70 bg-surface-card p-4', className)}>
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold leading-5 text-foreground">{title}</h3>
        {optional ? <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80">Optional</span> : null}
      </div>
      {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </section>
)

export const FieldLabel = ({ children, required = false }: { children: ReactNode; required?: boolean }) => (
  <span className="text-xs font-medium text-foreground/90">
    {children}
    {required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}
  </span>
)

export const ValidationSummary = ({ errors, title = 'Check the highlighted fields' }: { errors: string[]; title?: string }) => {
  if (!errors.length) return null
  return (
    <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

export const InheritedValueNote = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg bg-surface-panel px-3 py-2 text-xs text-muted-foreground ring-1 ring-border/40">
    {children}
  </p>
)
