import type { FC } from 'react'
import { X } from 'lucide-react'
import type { CartDrawerViewModel } from './CartDrawerController'
import { CartStep } from './CartDrawerCartStep'
import { DetailsStep } from './CartDrawerDetailsStep'
import { ReviewStep } from './CartDrawerReviewStep'
import { SummaryStep } from './CartDrawerSummaryStep'
import { CartBagIcon } from './StorefrontCartIcon'

export interface CartLine {
  lineId: string
  productId: string
  variantId?: string
  name: string
  unitPriceIdr: number
  quantity: number
}

export interface CartDrawerProps {
  open: boolean
  onClose: () => void
  lines: CartLine[]
  onIncrement: (lineId: string) => void
  onDecrement: (lineId: string) => void
  onOrderPlaced: (orderNumber: string) => void
  formatter: Intl.NumberFormat
}

const stepOrder = ['cart', 'details', 'review', 'summary'] as const
const stepLabels = {
  cart: 'Cart',
  details: 'Details',
  review: 'Review',
  summary: 'Payment',
}
const titles = {
  cart: 'Cart',
  details: 'Details',
  review: 'Review',
  summary: 'Payment',
}

const CheckoutProgress: FC<Pick<CartDrawerViewModel, 'step'>> = ({ step }) => {
  const activeIndex = stepOrder.indexOf(step)

  return (
    <nav className="px-5 pb-5 sm:px-6 sm:pb-6 lg:px-7" aria-label="Checkout progress">
      <div className="grid grid-cols-4 items-center gap-1">
        {stepOrder.map((stepId, index) => {
          const isComplete = index < activeIndex
          const isActive = stepId === step

          return (
            <span
              key={stepId}
              className={`min-w-0 text-center sf-type-2 font-medium leading-none ${
                isComplete || isActive ? 'text-[#00813f]' : 'text-black/52'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {stepLabels[stepId]}
            </span>
          )
        })}
      </div>
      <div className="relative mt-4 h-[2px] rounded-full bg-black/[0.09]">
        <span
          className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-[#00813f] transition-transform duration-300 motion-reduce:transition-none"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
          aria-hidden="true"
        />
      </div>
    </nav>
  )
}

export const CartDrawer: FC<CartDrawerViewModel> = (viewModel) => {
  const { open, step, handleClose } = viewModel
  if (!open) return null

  return (
    <div
      className="storefront-modal-layer fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-stretch sm:justify-end"
      onClick={handleClose}
      role="presentation"
    >
      <section
        onClick={(event) => event.stopPropagation()}
        className="storefront-checkout-sheet storefront-checkout-sheet--enter relative flex h-[92svh] w-full max-w-[520px] flex-col bg-[var(--sf-cream)] text-black shadow-[-14px_0_42px_rgba(0,0,0,0.16)] sm:h-full sm:max-h-none lg:max-w-[590px] xl:max-w-[600px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storefront-checkout-title"
      >
        <header className="flex shrink-0 items-center justify-between px-5 pb-5 pt-10 sm:px-6 sm:pb-6 sm:pt-11 lg:px-7 lg:pt-12">
          <h2
            id="storefront-checkout-title"
            className="flex min-w-0 items-center gap-3.5 sf-type-5 font-medium leading-[0.94]"
          >
            <CartBagIcon className="h-auto w-[2.05rem] -translate-y-[1px] sm:w-[2.2rem]" />
            <span className="truncate">{titles[step]}</span>
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="tap-scale inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-black/65 transition hover:bg-black/[0.045] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/25"
            aria-label="Close cart"
          >
            <X className="size-6" strokeWidth={2.1} />
          </button>
        </header>

        <CheckoutProgress step={step} />

        <div className="flex min-h-0 flex-1 flex-col">
          {step === 'cart' && <CartStep {...viewModel} />}
          {step === 'details' && <DetailsStep {...viewModel} />}
          {step === 'review' && <ReviewStep {...viewModel} />}
          {step === 'summary' && <SummaryStep {...viewModel} />}
        </div>
      </section>
    </div>
  )
}

export default CartDrawer
