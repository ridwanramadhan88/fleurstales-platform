import type { FC, KeyboardEvent } from 'react'
import { CheckCircle2, Clock3, ExternalLink } from 'lucide-react'
import { formatIdrCurrency } from '../../lib/formatters'
import { useSettingsStore } from '../../store/settingsStore'
import type { FinanceQueueRow } from './OrderVerificationQueueController'

interface OrderVerificationQueueRowProps {
  row: FinanceQueueRow
  onOpen: () => void
}

const paymentMethodLabel = (method: FinanceQueueRow['paymentMethod']): string => {
  if (method === 'cash') return 'Cash'
  if (method === 'transfer') return 'Bank transfer'
  if (method === 'card') return 'Card'
  return 'Other'
}

const formatPaidAt = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const OrderVerificationQueueRow: FC<OrderVerificationQueueRowProps> = ({ row, onOpen }) => {
  const bankAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const accountLabel = row.accountId === 'cash:main'
    ? 'Cash'
    : row.accountId === 'legacy:unassigned' || !row.accountId
      ? 'Unassigned account'
      : bankAccounts.find((account) => account.id === row.accountId)?.bankName ?? row.accountId
  const complete = row.status === 'complete'
  const refunded = row.order.paymentStatus === 'refunded' || Boolean(row.order.refundCompletedAt)

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpen()
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open finance evidence for ${row.order.orderNumber}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-xl bg-surface-card px-4 py-3.5 shadow-ios-sm ring-1 ring-border/60 transition hover:bg-surface-panel hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{row.order.customerName}</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold ${complete ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}>
              {complete ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-3" />}
              {complete ? 'Complete' : 'In Progress'}
            </span>
            {refunded && (
              <span className="rounded-full bg-warning/10 px-2.5 py-1 text-2xs font-semibold text-warning">Refunded</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.order.orderNumber} · {row.order.branch}
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Received into</p>
              <p className="mt-0.5 font-medium text-foreground">{accountLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Payment method</p>
              <p className="mt-0.5 font-medium text-foreground">{paymentMethodLabel(row.paymentMethod)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Payment confirmed</p>
              <p className="mt-0.5 font-medium text-foreground">{formatPaidAt(row.paymentConfirmedAt)}</p>
            </div>
          </div>
          {row.transactionStatus !== 'verified' && (
            <p className="mt-2 text-2xs font-medium text-warning">
              Legacy ledger status: {row.transactionStatus}. No Finance approval action is required in this workflow.
            </p>
          )}
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-xs text-muted-foreground">Amount received</p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {formatIdrCurrency(row.paymentAmountIdr)}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 text-2xs font-semibold text-primary">
            View evidence <ExternalLink className="size-3" />
          </span>
        </div>
      </div>
    </article>
  )
}
