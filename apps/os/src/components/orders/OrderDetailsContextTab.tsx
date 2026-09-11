import type { FC } from 'react'
import { ImageIcon, Package2 } from 'lucide-react'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import type { OrderDetailContextTab } from './orderDetailsContext'
import { getDisplayScheduleLabel } from './orderTableFormatters'
import { PAYMENT_STATUS_LABELS } from './orderTableLabels'
import { OrderDetailsFinanceSection } from './OrderDetailsFinanceSection'

interface OrderDetailsContextTabProps {
  viewModel: OrderDetailsViewModel
  context: OrderDetailContextTab
}

const FactRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-3 last:border-b-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="break-words text-right text-sm font-semibold text-foreground">{value}</dd>
  </div>
)

const AdminProcessContent: FC<{ viewModel: OrderDetailsViewModel }> = ({ viewModel }) => {
  const { order } = viewModel
  const schedule = getDisplayScheduleLabel(order) ?? 'Not set'
  const fulfillment = order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'
  const payment = PAYMENT_STATUS_LABELS[order.paymentStatus]

  const facts: Array<[string, string]> = order.status === 'pending_verification'
    ? [
        ['Payment', payment],
        ['Schedule', schedule],
        ['Fulfillment', fulfillment],
      ]
    : order.status === 'confirmed'
      ? [
          ['Payment', payment],
          ['Florist', order.florist ?? 'Not assigned'],
          ['Schedule', schedule],
        ]
      : order.status === 'processing'
        ? [
            ['Florist', order.florist ?? 'Not assigned'],
            ['Finished photo', order.finishPhotoUrl ? 'Uploaded' : 'Required'],
            ['Schedule', schedule],
          ]
        : order.status === 'ready'
          ? [
              ['Fulfillment', fulfillment],
              ['Finished photo', order.finishPhotoUrl ? 'Uploaded' : 'Missing'],
              [order.fulfillment === 'delivery' ? 'Destination' : 'Schedule', order.fulfillment === 'delivery' ? order.deliveryAddress ?? 'Not set' : schedule],
            ]
          : [
              ['Destination', order.deliveryAddress ?? 'Not set'],
              ['Customer', viewModel.customerWhatsappNumber ?? 'Not set'],
              ['Schedule', schedule],
            ]

  return (
    <section className="rounded-2xl bg-surface-card px-4 ring-1 ring-border/60" aria-label="Order process">
      <dl>
        {facts.map(([label, value]) => <FactRow key={label} label={label} value={value} />)}
      </dl>
    </section>
  )
}

const FloristProductionContent: FC<{ viewModel: OrderDetailsViewModel }> = ({ viewModel }) => {
  const { order, productDisplay, itemDisplays } = viewModel
  const items = order.items?.length
    ? order.items
    : [{
        id: `${order.orderNumber}-legacy-line`,
        productName: productDisplay.name || order.productName || 'Custom order',
        quantity: 1,
        flowerRecipeSnapshot: undefined,
      }]
  const schedule = getDisplayScheduleLabel(order) ?? 'Not set'
  const operationalNote = (order.orderNote ?? order.internalNote)?.trim()
  const greetingMessage = (order.greetingMessage ?? order.giftMessage)?.trim()

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Production</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{schedule}</p>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">{order.florist ?? 'Not assigned'}</p>
        </div>

        <div className="divide-y divide-border/50">
          {items.map((item, index) => {
            const display = itemDisplays[item.id] ?? (index === 0 ? productDisplay : undefined)
            const recipe = item.flowerRecipeSnapshot ?? []
            return (
              <div key={item.id} className="py-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-panel ring-1 ring-border/40">
                    {display?.imageUrl ? (
                      <img src={display.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <Package2 className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{item.productName || display?.name || 'Custom order'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.quantity} ×{display?.variantLabel ? ` ${display.variantLabel}` : ''}
                    </p>
                  </div>
                </div>

                {recipe.length > 0 && (
                  <div className="mt-3 rounded-xl bg-primary/[0.055] px-3 py-2.5 ring-1 ring-primary/10">
                    <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-primary" data-no-translate>Resep Bunga</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {recipe.map((flower, flowerIndex) => (
                        <span key={`${flower.flowerName}-${flowerIndex}`} className="text-xs font-medium text-foreground/80">
                          {flower.flowerName} · {flower.quantity} {flower.unit === 'bunch' ? 'ikat' : 'tangkai'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {(operationalNote || greetingMessage) && (
        <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
          {operationalNote && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Operational note</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{operationalNote}</p>
            </div>
          )}
          {greetingMessage && (
            <div className={operationalNote ? 'mt-4 border-t border-border/50 pt-4' : ''}>
              <p className="text-xs font-semibold text-muted-foreground">Greeting card</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{greetingMessage}</p>
              {order.greetingCardName?.trim() && <p className="mt-1 text-xs text-muted-foreground">{order.greetingCardName}</p>}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-panel text-muted-foreground">
            <ImageIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Finished photo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{order.finishPhotoUrl ? 'Uploaded' : 'Not uploaded yet'}</p>
          </div>
          {order.finishPhotoUrl && (
            <img src={order.finishPhotoUrl} alt="Finished product" className="size-14 rounded-xl object-cover ring-1 ring-border/50" />
          )}
        </div>
      </section>
    </div>
  )
}

export const OrderDetailsContextTab: FC<OrderDetailsContextTabProps> = ({ viewModel, context }) => {
  if (context === 'finance') {
    return <OrderDetailsFinanceSection viewModel={viewModel} mode="content" />
  }
  if (context === 'production') {
    return <FloristProductionContent viewModel={viewModel} />
  }
  return <AdminProcessContent viewModel={viewModel} />
}

export default OrderDetailsContextTab
