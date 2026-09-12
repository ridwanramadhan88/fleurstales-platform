import type { FC } from 'react'
import { Check } from 'lucide-react'
import type { OrderFulfillment, OrderStatus } from '../../data/shared/databaseTypes'

const DELIVERY_STEPS: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
  'delivered',
]

const PICKUP_STEPS: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'picked_up',
]

const STEP_LABELS: Partial<Record<OrderStatus, string>> = {
  pending_verification: 'Konfirmasi',
  confirmed: 'Dikonfirmasi',
  processing: 'Diproses',
  ready: 'Siap',
  delivering: 'Dikirim',
  delivered: 'Selesai',
  picked_up: 'Selesai',
}

const CLOSED_STATUSES: OrderStatus[] = ['cancelled', 'failed']

interface StorefrontOrderStatusBarProps {
  status: OrderStatus
  fulfillment: OrderFulfillment
}

export const StorefrontOrderStatusBar: FC<StorefrontOrderStatusBarProps> = ({
  status,
  fulfillment,
}) => {
  const steps = fulfillment === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS
  const currentIndex = steps.indexOf(status)
  const terminalIssue = CLOSED_STATUSES.includes(status)

  if (terminalIssue) {
    return (
      <div className="rounded-xl border border-red-800/15 bg-red-800/[0.045] px-4 py-3 text-center sf-type-2 font-semibold text-red-900">
        {status === 'cancelled' ? 'Pesanan dibatalkan' : 'Pesanan perlu perhatian'}
      </div>
    )
  }

  return (
    <ol
      className="grid w-full min-w-0 items-start"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label="Status pesanan"
      data-storefront-order-status
    >
      {steps.map((step, index) => {
        const done = currentIndex > index
        const current = currentIndex === index
        const reached = done || current

        return (
          <li
            key={step}
            className="relative flex min-w-0 flex-col items-center"
            aria-current={current ? 'step' : undefined}
            data-status-step={step}
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[calc(50%+18px)] top-[15px] h-0.5 w-[calc(100%-36px)] overflow-hidden rounded-full bg-black/10"
              >
                <span
                  className={`block h-full w-full origin-left rounded-full bg-[#00813f]/70 transition-transform duration-500 ${index < currentIndex ? 'scale-x-100' : 'scale-x-0'}`}
                />
              </span>
            ) : null}

            <span
              className={`relative z-10 flex size-8 items-center justify-center rounded-full transition-all duration-300 ${
                reached
                  ? 'bg-[#00813f] text-white'
                  : 'border border-black/15 bg-[var(--sf-cream)] text-black/25'
              } ${current ? 'animate-[pulse_6s_ease-in-out_infinite] motion-reduce:animate-none' : ''}`}
            >
              {done ? (
                <Check className="size-4" strokeWidth={2.2} />
              ) : current ? (
                <span className="size-2 rounded-full bg-white" aria-hidden="true" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              )}
            </span>

            <span
              className={`mt-1.5 min-h-[2.25rem] w-full px-0.5 text-center text-[9px] font-medium leading-[11px] sm:text-[11px] sm:leading-3 ${
                current ? 'font-semibold text-[#006f36]' : done ? 'text-black/70' : 'text-black/38'
              }`}
            >
              {STEP_LABELS[step] ?? step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default StorefrontOrderStatusBar
