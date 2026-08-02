import type { FC } from 'react'
import { Package2 } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { OrderProductDisplay } from '../../domain/catalogDomain'
import { formatIdrCurrency } from '../../lib/formatters'

interface OrderFinanceReviewProductSummaryProps {
  order: OrderTableRow
  productDisplay: OrderProductDisplay
  itemDisplays: Record<string, OrderProductDisplay>
}

export const OrderFinanceReviewProductSummary: FC<
  OrderFinanceReviewProductSummaryProps
> = ({ order, productDisplay, itemDisplays }) => {
  const items = order.items?.length
    ? order.items
    : [
        {
          id: `${order.orderNumber}-legacy-line`,
          productId: order.productId,
          variantId: order.variantId,
          productName: productDisplay.name || order.productName || 'Custom order',
          quantity: 1,
          unitPriceIdr: order.itemsSubtotalIdr ?? order.totalIdr,
        },
      ]
  const itemsSubtotalIdr =
    order.itemsSubtotalIdr ??
    items.reduce((sum, item) => sum + item.unitPriceIdr * item.quantity, 0)
  const discountIdr = order.discountIdr ?? 0
  const deliveryFeeIdr = order.deliveryFeeIdr ?? 0
  const showTotalsBreakdown = discountIdr > 0 || deliveryFeeIdr > 0

  return (
    <section
      aria-label="Order summary"
      className="space-y-4 rounded-xl border border-border bg-card p-3 shadow-ios-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package2 className="size-3.5" />
          </span>
          <h3 className="min-w-0 text-sm font-semibold leading-5 text-foreground">Order summary</h3>
        </div>
        <p className="shrink-0 text-sm font-semibold text-foreground">
          {formatIdrCurrency(order.totalIdr)}
        </p>
      </div>

      <div className="divide-y divide-border/45 overflow-hidden rounded-xl border border-border/50">
        {items.map((item, index) => {
          const itemDisplay = itemDisplays[item.id] ?? (index === 0 ? productDisplay : undefined)
          const metadata = [
            itemDisplay?.variantLabel,
            itemDisplay?.sku ? `SKU ${itemDisplay.sku}` : undefined,
          ].filter((value): value is string => Boolean(value))

          return (
            <div key={item.id} className="flex items-start gap-3 p-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-surface-panel ring-1 ring-border/30">
                {itemDisplay?.imageUrl ? (
                  <img
                    src={itemDisplay.imageUrl}
                    alt={item.productName || itemDisplay.name || 'Product'}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <Package2 className="size-5" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold leading-5 text-foreground">
                    {item.productName || itemDisplay?.name || 'Custom order'}
                  </p>
                  <p className="shrink-0 text-sm font-semibold text-foreground">
                    {formatIdrCurrency(item.unitPriceIdr * item.quantity)}
                  </p>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.quantity} × {formatIdrCurrency(item.unitPriceIdr)}
                  {metadata.length > 0 ? ` · ${metadata.join(' · ')}` : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {showTotalsBreakdown ? (
        <div className="ml-auto w-full max-w-xs space-y-1.5 text-xs">
        <div className="flex justify-between gap-3 text-muted-foreground">
          <span>Items subtotal</span>
          <span>{formatIdrCurrency(itemsSubtotalIdr)}</span>
        </div>
        {discountIdr > 0 ? (
          <div className="flex justify-between gap-3 text-success">
            <span>Discount{order.promoCode ? ` · ${order.promoCode}` : ''}</span>
            <span>−{formatIdrCurrency(discountIdr)}</span>
          </div>
        ) : null}
        {deliveryFeeIdr > 0 ? (
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Delivery fee</span>
            <span>{formatIdrCurrency(deliveryFeeIdr)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5 text-sm font-semibold text-foreground">
          <span>Total</span>
          <span>{formatIdrCurrency(order.totalIdr)}</span>
        </div>
        </div>
      ) : null}
    </section>
  )
}
