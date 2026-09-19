import type { FC } from 'react'
import { AlertCircle, Minus, Plus } from 'lucide-react'
import type { CartDrawerViewModel } from './CartDrawerController'
import { CartBagIcon } from './StorefrontCartIcon'
import { useCatalogStore } from '../../store/catalogStore'
import { getStorefrontCartLineImage } from './storefrontProductImages'
import { formatIdr } from '../../lib/currency'

export const CartStep: FC<CartDrawerViewModel> = ({
  lines,
  onIncrement,
  onDecrement,
  onStartShopping,
  formatter,
  itemsTotalIdr,
  cartIssues,
  cartHasUnavailableItems,
  setStep,
}) => {
  const catalogProducts = useCatalogStore((state) => state.products)
  const isEmpty = lines.length === 0

  return (
    <>
      <div className="storefront-checkout-scroll flex-1 overflow-y-auto px-5 pb-5 sm:px-6 lg:px-7">
        {isEmpty ? (
          <div className="grid min-h-[20rem] place-items-center text-center">
            <div className="max-w-xs">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#eee4cc]">
                <CartBagIcon className="h-auto w-7 opacity-55" />
              </span>
              <h3 className="mt-5 sf-type-4 font-medium">Your cart is empty</h3>
              <p className="mt-2 sf-support text-black/52">Choose something beautiful.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.09]">
            {lines.map((line) => {
              const issue = cartIssues.find((item) => item.lineId === line.lineId)
              const imageUrl = getStorefrontCartLineImage(catalogProducts, line.productId, line.variantId)
              return (
                <article key={line.lineId} className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 py-[1.125rem] sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-[1.125rem] sm:py-5 lg:grid-cols-[112px_minmax(0,1fr)] lg:gap-5 lg:py-6">
                  <div className="relative aspect-[4/5] overflow-hidden bg-[#eee4cc] [clip-path:polygon(0_0,100%_2%,97%_100%,3%_97%)]">
                    <span className="absolute inset-0 grid place-items-center px-2 text-center sf-type-1 font-medium text-black/40" aria-hidden="true">Fleurstales</span>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => { event.currentTarget.style.display = 'none' }}
                        className="relative h-full w-full object-cover"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col justify-between gap-3.5">
                    <div className="flex items-start justify-between gap-3.5">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-[1.125rem] font-medium leading-[1.08] sm:text-[1.2rem]">{line.name}</h3>
                        <p className="mt-1.5 sf-type-2 leading-5 text-black/52">{formatIdr(line.unitPriceIdr, formatter)} each</p>
                        {issue ? (
                          <p className="mt-2 flex gap-1.5 text-[0.78rem] leading-5 text-[#9b4d24]" role="alert">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <span>{issue.message}</span>
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 pt-0.5 sf-type-2 font-medium tabular-nums">{formatIdr(line.unitPriceIdr * line.quantity, formatter)}</p>
                    </div>
                    <div className="inline-grid h-11 w-fit grid-cols-[44px_36px_44px] items-center overflow-hidden rounded-full border border-black/16 bg-white/55">
                      <button
                        type="button"
                        onClick={() => onDecrement(line.lineId)}
                        className="tap-scale grid h-full place-items-center text-black/58 transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00813f]/30"
                        aria-label={line.quantity === 1 ? `Remove ${line.name} from cart` : `Decrease quantity for ${line.name}`}
                      >
                        <Minus className="size-3" strokeWidth={1.8} />
                      </button>
                      <span className="text-center sf-type-1 font-medium tabular-nums">{line.quantity}</span>
                      <button type="button" disabled={Boolean(issue)} onClick={() => onIncrement(line.lineId)} className="tap-scale grid h-full place-items-center text-black/58 transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00813f]/30 disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Increase quantity for ${line.name}`}><Plus className="size-3" strokeWidth={1.8} /></button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-black/12 bg-[var(--sf-cream)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pb-5 lg:px-7">
        <a href="/track" className="mb-3 flex min-h-11 items-center justify-center rounded-full sf-type-2 font-medium text-black/58 underline decoration-black/25 underline-offset-4 transition hover:text-black">
          Already placed an order? Track Order →
        </a>
        {isEmpty ? (
          <button type="button" onClick={onStartShopping} className="sf-primary-action tap-scale flex w-full items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0e6dd]">
            Start shopping
          </button>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="sf-type-2 font-medium text-black/58">Subtotal</p>
              <p className="sf-type-4 font-medium leading-none tabular-nums">{formatIdr(itemsTotalIdr, formatter)}</p>
            </div>
            {cartHasUnavailableItems ? (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-[#9b4d24]/8 px-3 py-2.5 text-[0.78rem] leading-5 text-[#7e3e1d]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                Remove or replace unavailable items before checkout.
              </p>
            ) : null}
            <button type="button" disabled={cartHasUnavailableItems} onClick={() => setStep('details')} className="sf-primary-action tap-scale flex w-full items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0e6dd]">
              Continue
            </button>
          </>
        )}
      </footer>
    </>
  )
}
