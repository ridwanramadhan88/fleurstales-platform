import type { ReactNode } from 'react'

interface FinanceModuleHeaderProps {
  /** Module title, e.g. "Order Reconciliation". */
  title: string
  /** One-line context under the title. */
  description?: ReactNode
  /** Optional help affordance (InfoHint) rendered beside the title. */
  hint?: ReactNode
  /** Optional action buttons rendered on the right. */
  actions?: ReactNode
}

/**
 * @description Single standard header for every Finance workspace module
 * (Reconciliation, Transactions, Balance, Payroll, Refunds): plain
 * title + description on the left, actions on the right. No card chrome,
 * no icon tiles — the module tab cards above already carry those.
 */
export const FinanceModuleHeader = ({
  title,
  description,
  hint,
  actions,
}: FinanceModuleHeaderProps) => (
  <header className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
          {title}
        </h1>
        {hint}
      </div>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </header>
)
