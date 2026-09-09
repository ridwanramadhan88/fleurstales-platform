import { useState, type FC } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CreditCard } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { formatIdrCurrency } from '../../lib/formatters'
import { OrderPaymentProofFinanceCard } from './OrderPaymentProofFinanceCard'
import { getFinancePresentation } from './orderDetailsPresentation'

interface OrderPaymentProofSummaryProps {
  order: OrderTableRow
}

export const OrderPaymentProofSummary: FC<OrderPaymentProofSummaryProps> = ({ order }) => {
  const [showProof, setShowProof] = useState(false)
  const finance = getFinancePresentation(order)
  const method = order.paymentMethod === 'transfer' ? 'Transfer' : order.paymentMethod === 'cash' ? 'Cash' : 'Payment method not set'

  if (finance.state === 'attention') {
    return (
      <section className="mb-3 rounded-2xl bg-warning/7 p-4 ring-1 ring-warning/25" aria-label="Finance needs attention">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-warning">Finance needs attention</p>
            <div className="mt-1.5 space-y-1">
              {finance.reasons.map((reason) => (
                <p key={reason} className="text-xs leading-5 text-muted-foreground">{reason}</p>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-background/80 p-2.5 ring-1 ring-border/60">
                <p className="text-2xs text-muted-foreground">Expected</p>
                <p className="mt-0.5 text-xs font-semibold">{formatIdrCurrency(order.totalIdr)}</p>
              </div>
              <div className="rounded-xl bg-background/80 p-2.5 ring-1 ring-border/60">
                <p className="text-2xs text-muted-foreground">Recorded paid</p>
                <p className="mt-0.5 text-xs font-semibold">{formatIdrCurrency(finance.paidAmount)}</p>
              </div>
              <div className="rounded-xl bg-background/80 p-2.5 ring-1 ring-border/60">
                <p className="text-2xs text-muted-foreground">Balance</p>
                <p className="mt-0.5 text-xs font-semibold">{formatIdrCurrency(finance.remainingBalance)}</p>
              </div>
            </div>
            {order.paymentMethod === 'transfer' && order.paymentProofUrl ? (
              <button
                type="button"
                onClick={() => setShowProof((value) => !value)}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-foreground hover:bg-background/70"
              >
                {showProof ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {showProof ? 'Hide proof' : 'View proof'}
              </button>
            ) : null}
          </div>
        </div>
        {showProof && order.paymentProofUrl ? <div className="mt-3"><OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} /></div> : null}
      </section>
    )
  }

  return (
    <section className="mb-3 rounded-2xl bg-surface-card p-3.5 ring-1 ring-border/60" aria-label="Payment summary">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${finance.state === 'resolved' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
          {finance.state === 'resolved' ? <CheckCircle2 className="size-4" /> : <CreditCard className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${finance.state === 'resolved' ? 'text-success' : 'text-foreground'}`}>
            {finance.state === 'resolved' ? 'Payment reconciled' : 'Payment reference'}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {method} · {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus}
          </p>
        </div>
        <p className="text-sm font-semibold text-foreground">{formatIdrCurrency(finance.paidAmount || order.totalIdr)}</p>
        {order.paymentMethod === 'transfer' && order.paymentProofUrl ? (
          <button
            type="button"
            onClick={() => setShowProof((value) => !value)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showProof ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showProof ? 'Hide proof' : 'View proof'}
          </button>
        ) : null}
      </div>
      {showProof && order.paymentProofUrl ? <div className="mt-3"><OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} /></div> : null}
    </section>
  )
}

export default OrderPaymentProofSummary
