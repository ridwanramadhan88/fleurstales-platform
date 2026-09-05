import type { FC } from 'react'
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
      onClick={(event) => { event.stopPropagation(); onClose() }}
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
              <a href={whatsAppLink} target="_blank" rel="noreferrer" onClick={onClose} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm">
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
      </div>
    </div>
  )
}

export default OrderPostActionModal
