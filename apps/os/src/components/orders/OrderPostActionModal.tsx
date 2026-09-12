import type { FC } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CheckCheck, CheckCircle2, Copy, MessageCircle, Star, Truck, XCircle } from 'lucide-react'

export interface OrderPostActionModalProps {
  kind: 'ready' | 'delivering' | 'review' | 'confirm' | 'reject' | null
  onClose: () => void
  customerWhatsappNumber: string | undefined
  readyMessage: string
  whatsAppLink: string
  finishPhotoUrl?: string
  deliveryAddress: string | undefined
  addressCopied: boolean
  onCopyAddress: () => void
  previewMessage?: string
  previewSending?: boolean
  onSendPreviewWhatsApp?: () => void
  onReviewRequestSent?: () => void
}

const MODAL_TITLE: Record<NonNullable<OrderPostActionModalProps['kind']>, string> = {
  ready: 'Order ready — notify customer',
  delivering: 'Out for delivery — courier address',
  review: 'Order complete — request a review',
  confirm: 'Order confirmed — notify customer',
  reject: 'Order rejected — notify customer',
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
  onReviewRequestSent,
}) => {
  if (!kind) return null

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[71] w-full rounded-t-2xl bg-card p-5 shadow-ios-lg ring-1 ring-border/60 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6"
        >
          <DialogPrimitive.Title className="sr-only">{MODAL_TITLE[kind]}</DialogPrimitive.Title>

          {kind === 'ready' ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><MessageCircle className="size-4" /></span>
                <div>
                  <h3 className="text-base font-semibold leading-6 text-foreground">Order ready — notify customer</h3>
                  <p className="text-xs text-muted-foreground">Send the ready notice on WhatsApp{customerWhatsappNumber ? ` · ${customerWhatsappNumber}` : ''}</p>
                </div>
              </div>
              {finishPhotoUrl && (
                <div className="mb-3 aspect-[4/5] w-full max-w-[160px] overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
                  <img src={finishPhotoUrl} alt="Finished product" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">{readyMessage}</div>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Close</button>
                <a href={whatsAppLink} target="_blank" rel="noreferrer" onClick={onClose} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm">
                  <MessageCircle className="size-3.5" /> Send WhatsApp
                </a>
              </div>
            </>
          ) : kind === 'review' ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Star className="size-4" /></span>
                <div>
                  <h3 className="text-base font-semibold leading-6 text-foreground">Order complete — request a review</h3>
                  <p className="text-xs text-muted-foreground">The link opens the completed tracking page and review form{customerWhatsappNumber ? ` · ${customerWhatsappNumber}` : ''}</p>
                </div>
              </div>
              <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">{readyMessage}</div>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Close</button>
                <a
                  href={whatsAppLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    onClose()
                    onReviewRequestSent?.()
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm"
                >
                  <MessageCircle className="size-3.5" /> Send review request
                </a>
              </div>
            </>
          ) : kind === 'delivering' ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><Truck className="size-4" /></span>
                <div>
                  <h3 className="text-base font-semibold leading-6 text-foreground">Out for delivery — courier address</h3>
                  <p className="text-xs text-muted-foreground">Copy the address for the courier</p>
                </div>
              </div>
              <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">{deliveryAddress ?? 'No delivery address on file for this order.'}</div>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Close</button>
                <button type="button" disabled={!deliveryAddress} onClick={onCopyAddress} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-success px-[18px] text-sm font-medium text-white shadow-ios-sm disabled:opacity-50">
                  {addressCopied ? <><CheckCheck className="size-3.5" />Copied</> : <><Copy className="size-3.5" />Copy address</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${kind === 'confirm' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                  {kind === 'confirm' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                </span>
                <div>
                  <h3 className="text-base font-semibold leading-6 text-foreground">{kind === 'confirm' ? 'Order confirmed — notify customer' : 'Order rejected — notify customer'}</h3>
                  <p className="text-xs text-muted-foreground">Send the WhatsApp message below{customerWhatsappNumber ? ` · ${customerWhatsappNumber}` : ''}</p>
                </div>
              </div>
              <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">{previewMessage}</div>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={onClose} disabled={previewSending} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Close</button>
                <button type="button" onClick={onSendPreviewWhatsApp} disabled={previewSending} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-white shadow-ios-sm disabled:opacity-60 ${kind === 'confirm' ? 'bg-success' : 'bg-destructive'}`}>
                  <MessageCircle className="size-3.5" />{previewSending ? 'Sending…' : 'Send WhatsApp'}
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default OrderPostActionModal
