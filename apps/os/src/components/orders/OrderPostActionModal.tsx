/**
 * @file OrderPostActionModal.tsx
 * @description Follow-up action modal shown right after advancing an order
 * to "Ready" (send the WhatsApp pickup notice) or "Delivering" (copy the
 * delivery address for the courier), used by OrderDetailsPanel. Stops
 * propagation on its own clicks so interacting with it never bubbles up and
 * closes the details panel underneath.
 */

import type { FC } from 'react'
import { CheckCheck, Copy, MessageCircle, Truck } from 'lucide-react'

export interface OrderPostActionModalProps {
  /** Which follow-up to show; modal is not rendered when null. */
  kind: 'ready' | 'delivering' | null
  onClose: () => void
  /** Customer's WhatsApp number, if known — used for the WhatsApp link/subtitle. */
  customerWhatsappNumber: string | undefined
  /** Pre-built pickup-ready WhatsApp message text. */
  readyMessage: string
  /** WhatsApp deep link for the ready message. */
  whatsAppLink: string
  /** Delivery address to display/copy for the courier, if any. */
  deliveryAddress: string | undefined
  addressCopied: boolean
  onCopyAddress: () => void
}

export const OrderPostActionModal: FC<OrderPostActionModalProps> = ({
  kind,
  onClose,
  customerWhatsappNumber,
  readyMessage,
  whatsAppLink,
  deliveryAddress,
  addressCopied,
  onCopyAddress,
}) => {
  if (!kind) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up w-full max-w-md rounded-t-2xl bg-card p-5 shadow-lg ring-1 ring-border/60 sm:rounded-xl"
      >
        {kind === 'ready' ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                <MessageCircle className="size-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold leading-6 text-foreground">
                  Order ready — notify customer
                </h3>
                <p className="text-xs text-muted-foreground">
                  Send the pickup notice on WhatsApp
                  {customerWhatsappNumber ? ` · ${customerWhatsappNumber}` : ''}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">
              {readyMessage}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                Close
              </button>
              <a
                href={whatsAppLink}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm transition hover:bg-success"
              >
                <MessageCircle className="size-3.5" />
                Send WhatsApp
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                <Truck className="size-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold leading-6 text-foreground">
                  Out for delivery — courier address
                </h3>
                <p className="text-xs text-muted-foreground">
                  Copy the address for the courier
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">
              {deliveryAddress ?? 'No delivery address on file for this order.'}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!deliveryAddress}
                onClick={onCopyAddress}
                className="inline-flex cursor-pointer items-center justify-center rounded-full bg-success text-sm font-medium text-white shadow-ios-sm transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                {addressCopied ? (
                  <>
                    <CheckCheck className="size-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy address
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderPostActionModal
