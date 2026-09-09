import { useState, type FC } from 'react'
import { ChevronDown, FileImage, ShieldCheck } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { formatIdrCurrency } from '../../lib/formatters'
import { OrderPaymentProofFinanceCard } from './OrderPaymentProofFinanceCard'

interface OrderPaymentProofSummaryProps {
  order: OrderTableRow
}

export const OrderPaymentProofSummary: FC<OrderPaymentProofSummaryProps> = ({ order }) => {
  const [open, setOpen] = useState(false)
  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0)
  const latestPayment = [...(order.paymentHistory ?? [])]
    .filter((event) => event.type === 'payment_received' || event.type === 'payment_status_adjusted')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  const method = latestPayment?.method ?? order.paymentMethod

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-success/20 bg-success/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-success">Payment verified</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {method === 'transfer' ? 'Transfer' : method === 'cash' ? 'Cash' : 'Payment'} · {formatIdrCurrency(paidAmount)}
          </p>
        </div>
        {order.paymentProofUrl ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-foreground">
            <FileImage className="size-3.5" /> View proof
          </span>
        ) : null}
        <ChevronDown className={'size-4 shrink-0 text-muted-foreground transition ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && order.paymentProofUrl ? (
        <div className="border-t border-success/15 p-3">
          <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
        </div>
      ) : null}
    </section>
  )
}

export default OrderPaymentProofSummary
