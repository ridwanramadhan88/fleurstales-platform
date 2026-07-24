import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { AlertTriangle, ArrowRightLeft } from 'lucide-react'
import type {
  StockEventKind,
  StockItem,
  StockTransfer,
  StockTransferStatus,
} from '../../store/stockStore'

interface Props {
  item: StockItem
  activeTransfer: StockTransfer | null
  canEdit: boolean
  onRequestTransfer: (params: {
    itemId: string
    fromBranch: StockItem['branch']
    toBranch: StockItem['branch']
    quantity: number
  }) => void
  onAdvanceTransferStatus: (transferId: string, status: StockTransferStatus) => void
  onRecordLoss: (params: {
    itemId: string
    quantity: number
    kind: StockEventKind
    reason: string
  }) => void
}

const statusLabels: Record<StockTransferStatus, string> = {
  requested: 'Requested',
  in_transit: 'In transit',
  received: 'Received',
  cancelled: 'Cancelled',
}

export const StockTransferLossSection: FC<Props> = ({
  item,
  activeTransfer,
  canEdit,
  onRequestTransfer,
  onAdvanceTransferStatus,
  onRecordLoss,
}) => {
  const [quantity, setQuantity] = useState('0')
  const [reason, setReason] = useState('')

  const submitLoss = (event: FormEvent) => {
    event.preventDefault()
    const parsed = Number.parseInt(quantity.trim(), 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    onRecordLoss({
      itemId: item.id,
      quantity: parsed,
      kind: 'loss',
      reason: reason.trim() || 'Adjustment',
    })
    setQuantity('0')
    setReason('')
  }

  return (
    <section className="space-y-2 rounded-xs bg-muted px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><ArrowRightLeft className="size-3" /></span>
          <p className="text-2xs font-semibold">Transfers</p>
        </div>
        <span className="text-2xs text-muted-foreground">
          {activeTransfer ? `${statusLabels[activeTransfer.status]} · ${activeTransfer.quantity} ${item.unit}` : 'No active transfer'}
        </span>
      </div>
      {canEdit && !activeTransfer && (
        <button
          type="button"
          onClick={() =>
            onRequestTransfer({
              itemId: item.id,
              fromBranch: item.branch,
              toBranch: item.branch === 'Kedamaian' ? 'Pahoman' : 'Kedamaian',
              quantity: Math.min(item.availableQty, 10),
            })
          }
          className="w-full h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-white"
        >
          Request transfer suggestion
        </button>
      )}
      {canEdit && activeTransfer && (
        <div className="flex gap-2">
          {activeTransfer.status === 'requested' && (
            <button
              type="button"
              onClick={() => onAdvanceTransferStatus(activeTransfer.id, 'in_transit')}
              className="flex-1 h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-white"
            >
              Mark in transit
            </button>
          )}
          {activeTransfer.status === 'in_transit' && (
            <button
              type="button"
              onClick={() => onAdvanceTransferStatus(activeTransfer.id, 'received')}
              className="flex-1 h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-white"
            >
              Mark received
            </button>
          )}
          <button
            type="button"
            onClick={() => onAdvanceTransferStatus(activeTransfer.id, 'cancelled')}
            className="flex-1 h-11 rounded-full bg-destructive/10 px-[18px] text-sm font-medium text-destructive"
          >
            Cancel transfer
          </button>
        </div>
      )}
      {canEdit && (
        <form className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]" onSubmit={submitLoss}>
          <label className="space-y-0.5 text-xs font-medium text-muted-foreground">
            Loss / write-off
            <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9 w-full rounded-sm border border-border bg-card px-3 text-sm" />
          </label>
          <label className="space-y-0.5 text-xs font-medium text-muted-foreground">
            Reason
            <span className="flex items-center gap-1.5">
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 flex-1 rounded-sm border border-border bg-card px-3 text-sm" placeholder="Damaged, expired..." />
              <button type="submit" className="inline-flex items-center justify-center bg-destructive/10 text-destructive rounded-full p-0 size-11 rounded-full p-0 whitespace-nowrap" aria-label="Record loss"><AlertTriangle className="size-3.5" /></button>
            </span>
          </label>
        </form>
      )}
    </section>
  )
}
