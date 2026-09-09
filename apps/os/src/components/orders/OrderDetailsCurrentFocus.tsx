import type { FC } from 'react'
import { CheckCircle2, Clock3, ImageIcon, PackageCheck, UserRound } from 'lucide-react'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { getOrderCurrentFocus } from './orderUxPresentation'
import { formatIdrCurrency } from '../../lib/formatters'

interface OrderDetailsCurrentFocusProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsCurrentFocus: FC<OrderDetailsCurrentFocusProps> = ({ viewModel }) => {
  const { order, nextStatus } = viewModel
  const focus = getOrderCurrentFocus(order, nextStatus)
  const completed = order.status === 'delivered' || order.status === 'picked_up'
  const showFinishedPhoto = Boolean(order.finishPhotoUrl && ['ready', 'delivering', 'delivered', 'picked_up'].includes(order.status))
  const paymentLabel = order.paymentStatus === 'paid'
    ? 'Paid · ' + formatIdrCurrency(order.totalIdr)
    : order.paymentStatus

  return (
    <section className="mb-4 rounded-2xl border border-primary/12 bg-surface-card p-4 shadow-ios-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-primary/70">{focus.eyebrow}</p>
          <h3 className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">{focus.title}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">{focus.description}</p>
        </div>
        {!completed && focus.nextAction ? (
          <div className="shrink-0 rounded-full bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary">
            Next · {focus.nextAction}
          </div>
        ) : completed ? (
          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="size-3.5" /> Complete
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-xl bg-surface-panel px-3 py-2.5">
          <Clock3 className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground">Schedule</p>
            <p className="truncate text-xs font-semibold text-foreground">{focus.schedule ?? 'Not set'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-panel px-3 py-2.5">
          <UserRound className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground">Florist</p>
            <p className="truncate text-xs font-semibold text-foreground">{order.florist ?? 'Not assigned'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-panel px-3 py-2.5">
          <PackageCheck className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground">Payment</p>
            <p className="truncate text-xs font-semibold text-foreground">{paymentLabel}</p>
          </div>
        </div>
      </div>

      {showFinishedPhoto ? (
        <div className="mt-4 grid gap-3 rounded-xl bg-success/5 p-3 ring-1 ring-success/15 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-center">
          <a href={order.finishPhotoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-muted/20 ring-1 ring-border/50">
            <img src={order.finishPhotoUrl} alt={'Finished product for ' + order.orderNumber} className="aspect-square size-full object-cover" />
          </a>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-success">
              <ImageIcon className="size-4" />
              <p className="text-xs font-semibold">Finished product ready</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use this as the visual handoff reference for {order.fulfillment === 'delivery' ? 'delivery' : 'pickup'}.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default OrderDetailsCurrentFocus
