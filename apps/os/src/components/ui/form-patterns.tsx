import type { ReactNode, Ref } from 'react'
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
  <section className={cn('space-y-3 rounded-2xl bg-surface-card p-5 shadow-ios-sm ring-1 ring-border/60', className)}>
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

export const ValidationSummary = ({
  errors,
  title = 'Check the highlighted fields',
  onErrorClick,
  summaryRef,
}: {
  errors: string[]
  title?: string
  onErrorClick?: (error: string) => void
  summaryRef?: Ref<HTMLDivElement>
}) => {
  if (!errors.length) return null
  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={onErrorClick ? -1 : undefined}
      className="rounded-2xl bg-surface-error p-4 text-sm text-destructive ring-1 ring-destructive/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <ul className="mt-1 space-y-1 text-xs">
            {errors.map((error) => (
              <li key={error}>
                {onErrorClick ? (
                  <button type="button" onClick={() => onErrorClick(error)} className="min-h-7 text-left underline decoration-destructive/35 underline-offset-2 hover:decoration-current">
                    {error}
                  </button>
                ) : error}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export const InheritedValueNote = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl bg-surface-panel px-3 py-2 text-xs text-muted-foreground ring-1 ring-border/40">
    {children}
  </p>
)
