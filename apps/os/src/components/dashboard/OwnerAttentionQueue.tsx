import { useMemo, type FC } from 'react'
import { AlertTriangle, ChevronRight, FilePenLine } from 'lucide-react'
import { toFinanceModule, type AppNavigationRequest } from '../../config/appNavigation'
import { useOrdersStore } from '../../store/ordersStore'
import { surfaceCardClass } from '../ui/card'


const waitingLabel = (iso?: string) => {
  if (!iso) return 'Waiting for review'
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000))
  if (hours < 1) return 'New request'
  if (hours < 24) return `Waiting ${hours} hr${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `Waiting ${days} day${days === 1 ? '' : 's'}`
}

interface OwnerAttentionQueueProps {
  onNavigate: (target: AppNavigationRequest) => void
}

/**
 * Compact Owner-only escalation summary. It deliberately reuses existing
 * Finance and Orders workflows instead of adding approval controls to the
 * dashboard, keeping the landing page calm and decision-focused.
 */
export const OwnerAttentionQueue: FC<OwnerAttentionQueueProps> = ({ onNavigate }) => {
  const orders = useOrdersStore((state) => state.orders)
  const pendingOrderRequests = useMemo(() => orders.filter((order) => Boolean(order.pendingChangeRequest)), [orders])

  const totalAttention = pendingOrderRequests.length
  const oldestOrderRequest = [...pendingOrderRequests].sort((a, b) => (a.pendingChangeRequest?.requestedAt ?? '').localeCompare(b.pendingChangeRequest?.requestedAt ?? ''))[0]?.pendingChangeRequest

  if (totalAttention === 0) return null

  return (
    <section
      aria-labelledby="owner-attention-title"
      className={surfaceCardClass('standard')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="owner-attention-title" className="text-sm font-semibold leading-5 text-foreground">
              Owner attention
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalAttention} decision{totalAttention === 1 ? '' : 's'} waiting for you. Oldest items are shown first in their review workspace.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border/70 rounded-lg border border-border/70">
        {pendingOrderRequests.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate(toFinanceModule('collect_orders'))}
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-accent/50"
          >
            <FilePenLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                Order change requests
              </span>
              <span className="block text-xs text-muted-foreground">
                {pendingOrderRequests.length} finished order{pendingOrderRequests.length === 1 ? '' : 's'} need review · {waitingLabel(oldestOrderRequest?.requestedAt)}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )}

      </div>
    </section>
  )
}
