import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getRemainingOrderPaymentIdr } from '../../domain/orderPaymentGateDomain'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import { getQuickActionLabel } from './orderTableLabels'

interface OrderPaymentGateDialogProps { order: OrderTableRow; nextStatus: OrderStatus; formatter: Intl.NumberFormat; onCancel: () => void; onMarkPaidAndContinue: () => void }

export const OrderPaymentGateDialog: FC<OrderPaymentGateDialogProps> = ({ order, nextStatus, formatter, onCancel, onMarkPaidAndContinue }) => {
  const remainingIdr = getRemainingOrderPaymentIdr(order)
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Payment required" onClick={(event) => event.stopPropagation()} className="animate-sheet-up w-full max-w-md rounded-t-2xl bg-card p-5 shadow-lg ring-1 ring-border/60 sm:rounded-xl">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"><AlertTriangle className="size-5" /></span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 text-foreground">Payment required</h3>
            <p className="mt-1 text-sm font-semibold text-foreground"><span>Rp {formatter.format(remainingIdr)}</span><span className="font-normal text-muted-foreground"> remains unpaid.</span></p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Mark the order as paid before moving it to {getQuickActionLabel(nextStatus)}.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="order-2 inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium text-muted-foreground hover:bg-muted sm:order-1 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Keep pending</button>
          <button type="button" onClick={onMarkPaidAndContinue} className="order-1 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-success text-sm font-semibold text-white shadow-ios-sm hover:bg-success/90 sm:order-2 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Mark paid &amp; continue</button>
        </div>
      </div>
    </div>
  )
}
