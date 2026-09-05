/**
 * @file OrderPostActionModal.tsx
 * @description Follow-up action modal shown right after advancing an order
 * to "Ready" (send the WhatsApp pickup notice, with a preview of the finish
 * photo) or "Delivering" (copy the delivery address for the courier), used
 * by OrderDetailsPanel. Also doubles as the preview-before-send step for the
 * storefront confirm/reject decision ('confirm' / 'reject' kinds) — the
 * message is built and shown first, and the actual WhatsApp send only
 * happens when "Send WhatsApp" is clicked here. Stops propagation on its own
 * clicks so interacting with it never bubbles up and closes the details
 * panel underneath.
 */

import type { FC } from 'react'
import { CheckCheck, CheckCircle2, Copy, MessageCircle, Truck, XCircle } from 'lucide-react'

export interface OrderPostActionModalProps {
  /** Which follow-up to show; modal is not rendered when null. */
  kind: 'ready' | 'delivering' | 'confirm' | 'reject' | null
  onClose: () => void
  /** Customer's WhatsApp number, if known — used for the WhatsApp link/subtitle. */
  customerWhatsappNumber: string | undefined
  /** Pre-built pickup-ready WhatsApp message text. */
  readyMessage: string
  /** WhatsApp deep link for the ready message. */
  whatsAppLink: string
  /** Public URL of the order's finish photo, shown above the ready message. */
  finishPhotoUrl?: string
  /** Delivery address to display/copy for the courier, if any. */
  deliveryAddress: string | undefined
  addressCopied: boolean
  onCopyAddress: () => void
  /** Composed confirm/reject WhatsApp text, shown before it's sent. */
  previewMessage?: string
  /** True while the confirm/reject send is in flight. */
  previewSending?: boolean
  onSendPreviewWhatsApp?: () => void
}

export const OrderPostActionModal: FC<OrderPostActionModalProps> = ({
  kind,
  onClose,
  customerWhatsappNumber,
  readyMessage,
  whatsAppLink,
  finishPhotoUrl,
  deliveryAddress,
  addressCopied,
  onCopyAddress,
  previewMessage,
  previewSending,
  onSendPreviewWhatsApp,
}) => {
  if (!kind) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up w-full rounded-t-2xl bg-card p-5 shadow-ios-lg ring-1 ring-border/60 sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-2xl sm:p-6"
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
            {finishPhotoUrl && (
              <div className="mb-3 aspect-[4/5] w-full max-w-[160px] overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
                <img src={finishPhotoUrl} alt="Order finish photo" className="h-full w-full object-cover" />
              </div>
            )}
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
        ) : kind === 'delivering' ? (
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
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  kind === 'confirm' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                }`}
              >
                {kind === 'confirm' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              </span>
              <div>
                <h3 className="text-base font-semibold leading-6 text-foreground">
                  {kind === 'confirm' ? 'Order confirmed — notify customer' : 'Order rejected — notify customer'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Send the WhatsApp message below
                  {customerWhatsappNumber ? ` · ${customerWhatsappNumber}` : ''}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">
              {previewMessage}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={previewSending}
                className="inline-flex cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onSendPreviewWhatsApp}
                disabled={previewSending}
                className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-white shadow-ios-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  kind === 'confirm' ? 'bg-success hover:bg-success' : 'bg-destructive hover:bg-destructive'
                }`}
              >
                <MessageCircle className="size-3.5" />
                {previewSending ? 'Sending…' : 'Send WhatsApp'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderPostActionModal
