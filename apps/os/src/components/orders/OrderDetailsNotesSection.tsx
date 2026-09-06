import type { FC } from 'react'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsNotesSectionProps {
  viewModel: OrderDetailsViewModel
}

/**
 * @description Greeting-card message and operational note for the Details
 * tab. Same view/edit controls the delivery file always had — only their
 * home changed.
 */
export const OrderDetailsNotesSection: FC<OrderDetailsNotesSectionProps> = ({
  viewModel,
}) => {
  const { order, isEditing, draft, onDraftChange } = viewModel
  const hasGreetingCard = Boolean((order.greetingMessage ?? order.giftMessage)?.trim() || order.greetingCardName?.trim())
  const hasOrderNote = Boolean((order.orderNote ?? order.internalNote)?.trim())

  return (
    <>
      <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60" aria-label="Additional information">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Additional information</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Greeting card message</p>
        {!isEditing ? (
          hasGreetingCard ? (
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Message</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {(order.greetingMessage ?? order.giftMessage)?.trim() || '—'}
                </p>
              </div>
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Name on card</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {order.greetingCardName?.trim() || '—'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Not added</p>
          )
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft.greetingMessage}
              onChange={(event) => onDraftChange('greetingMessage', event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 py-2.5 text-sm"
              placeholder="Message"
            />
            <input
              value={draft.greetingCardName}
              onChange={(event) => onDraftChange('greetingCardName', event.target.value)}
              className="h-11 w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 text-sm"
              placeholder="Name on card"
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60" aria-label="Operational note">
        <p className="text-sm font-semibold leading-5 text-foreground">Operational note</p>
        {!isEditing ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {hasOrderNote ? order.orderNote ?? order.internalNote : 'Not added'}
          </p>
        ) : (
          <textarea
            value={draft.orderNote}
            onChange={(event) => onDraftChange('orderNote', event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 py-2.5 text-sm"
            placeholder="Special requests, recipient instructions, or other notes"
          />
        )}
      </section>
    </>
  )
}

export default OrderDetailsNotesSection
