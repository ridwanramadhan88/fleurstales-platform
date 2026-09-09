import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, PackageCheck } from 'lucide-react'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { getOperationalFocus } from './orderDetailsPresentation'

interface OrderDetailsCurrentFocusProps {
  viewModel: OrderDetailsViewModel
}

const toneStyles = {
  neutral: 'bg-surface-card ring-border/60 text-foreground',
  info: 'bg-info/5 ring-info/20 text-info',
  success: 'bg-success/5 ring-success/20 text-success',
  warning: 'bg-warning/5 ring-warning/25 text-warning',
  destructive: 'bg-destructive/5 ring-destructive/25 text-destructive',
} as const

const toneIcon = {
  neutral: CircleDot,
  info: CircleDot,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: AlertTriangle,
} as const

export const OrderDetailsCurrentFocus: FC<OrderDetailsCurrentFocusProps> = ({ viewModel }) => {
  const { order } = viewModel
  const focus = getOperationalFocus(order)
  const Icon = order.status === 'ready' || order.status === 'delivering' ? PackageCheck : toneIcon[focus.tone]

  return (
    <section className={`mb-3 rounded-2xl p-4 ring-1 ${toneStyles[focus.tone]}`} aria-label="Current order focus">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-current/10">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] opacity-70">{focus.eyebrow}</p>
          <h3 className="mt-1 text-base font-semibold leading-5 text-foreground">{focus.title}</h3>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{focus.description}</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {focus.facts.map((fact) => (
              <div key={fact.label} className="rounded-xl bg-background/70 px-3 py-2 ring-1 ring-border/50">
                <dt className="text-2xs font-medium text-muted-foreground">{fact.label}</dt>
                <dd className="mt-0.5 break-words text-xs font-semibold text-foreground">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

export default OrderDetailsCurrentFocus
