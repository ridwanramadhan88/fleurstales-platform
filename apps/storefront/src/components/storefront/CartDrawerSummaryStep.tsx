import type { FC } from 'react'
import { Banknote, Building2, Check } from 'lucide-react'
import type { CartDrawerViewModel } from './CartDrawerController'
import { formatDisplayDate } from '../ui/date-time-field'
import { StorefrontCopyButton } from './StorefrontCopyButton'

export const SummaryStep: FC<CartDrawerViewModel> = ({
  placedOrderNumber,
  formatter,
  fulfillment,
  deliveryDate,
  deliveryTime,
  itemsTotalIdr,
  deliveryFeeIdr,
  discountIdr,
  grandTotalIdr,
  appliedVoucherCode,
  paymentMethod,
  bankAccounts,
  paymentInstructions,
  handleClose,
}) => (
  <>
    <div className="storefront-checkout-scroll flex-1 overflow-y-auto px-5 pb-8 pt-5 sm:px-7 sm:pb-10 sm:pt-6 lg:px-8">
      <div className="pb-9 text-center sm:pb-10">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#00813f] text-white sm:size-[4.25rem]">
          <Check className="size-7 sm:size-8" strokeWidth={1.9} />
        </span>
        <p className="sf-label mt-5 text-[#00813f]">Order received</p>
        <h3 className="mt-2 text-[2.35rem] font-medium leading-[0.92]">
          Thank you!
        </h3>
        <p className="mx-auto mt-3 max-w-sm text-[1.05rem] leading-6 text-black/58">
          We received your order. The team will confirm it after payment.
        </p>
      </div>

      <section className="rounded-[var(--sf-radius-card)] bg-[#f0e6dd] px-5 py-5 sm:px-6 sm:py-6">
        <div className="text-center">
          <p className="sf-label text-black/42">Order number</p>
          <p className="mt-2 text-[2rem] font-medium leading-[0.96]">
            {placedOrderNumber || 'Pending'}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-5 text-center">
          <div>
            <p className="sf-label text-black/40">
              {fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} date
            </p>
            <p className="mt-1.5 sf-type-2 font-medium">{deliveryDate ? formatDisplayDate(deliveryDate) : 'To confirm'}</p>
          </div>
          <div>
            <p className="sf-label text-black/40">Time</p>
            <p className="mt-1.5 sf-type-2 font-medium">{deliveryTime || 'To confirm'}</p>
          </div>
        </div>
      </section>

      <section className="mt-9">
        <p className="sf-label text-[#00813f]">Payment</p>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00813f] text-white">
            {paymentMethod === 'transfer'
              ? <Building2 className="size-[1.05rem]" strokeWidth={1.8} />
              : <Banknote className="size-[1.05rem]" strokeWidth={1.8} />}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="sf-type-4 font-medium leading-[0.98]">
              {paymentMethod === 'transfer' ? 'Bank transfer' : 'Cash on pickup'}
            </h4>
            <p className="mt-1.5 sf-type-2 leading-6 text-black/56">
              {paymentMethod === 'transfer'
                ? 'Transfer to the account below.'
                : `Please prepare ${formatter.format(grandTotalIdr)} in cash.`}
            </p>
          </div>
        </div>

        {paymentMethod === 'transfer' && (
          <div className="mt-4 overflow-hidden rounded-[var(--sf-radius-field)] border border-black/12 bg-white/55">
            {bankAccounts.length > 0 ? bankAccounts.map((account, index) => (
              <div key={account.id} className={`space-y-3 px-4 py-4 ${index > 0 ? 'border-t border-black/10' : ''}`}>
                <div>
                  <p className="sf-type-2 font-medium">{account.bankName || 'Bank'}</p>
                  <p className="mt-1 sf-type-1 text-black/46">a.n. {account.accountHolder}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[1.7rem] font-medium leading-none tabular-nums">{account.accountNumber}</p>
                  <StorefrontCopyButton value={account.accountNumber} label="Copy" />
                </div>
              </div>
            )) : (
              <p className="px-4 py-3.5 sf-type-2 leading-6 text-black/50">The team will confirm the payment account after verification.</p>
            )}
          </div>
        )}

        {paymentInstructions.trim() && (
          <details className="mt-3 rounded-[var(--sf-radius-field)] bg-[#f0e6dd] px-4 py-3.5">
            <summary className="cursor-pointer sf-type-2 font-medium text-black/72">
              Payment note
            </summary>
            <p className="mt-2 sf-type-2 leading-6 text-black/60">{paymentInstructions}</p>
          </details>
        )}
      </section>

      <section className="mt-9">
        <p className="sf-label text-[#00813f]">Order total</p>
        <div className="mt-4 space-y-3 sf-type-2">
          <SummaryRow label="Subtotal" value={formatter.format(itemsTotalIdr)} />
          <SummaryRow
            label={fulfillment === 'delivery' ? 'Delivery fee' : 'Pickup fee'}
            value={fulfillment === 'delivery' ? formatter.format(deliveryFeeIdr) : 'Free'}
          />
          {appliedVoucherCode && discountIdr > 0 && (
            <SummaryRow label={`Voucher (${appliedVoucherCode})`} value={`-${formatter.format(discountIdr)}`} accent />
          )}
        </div>
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-black/12 pt-4">
          <span className="sf-type-3 font-medium">Total to pay</span>
          <span className="text-[2.65rem] font-medium leading-none tabular-nums">
            {formatter.format(grandTotalIdr)}
          </span>
        </div>
      </section>
    </div>

    <footer className="shrink-0 border-t border-black/12 bg-[var(--sf-cream)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-5 lg:px-8">
      <button
        type="button"
        onClick={handleClose}
        className="sf-primary-action tap-scale w-full px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0e6dd]"
      >
        Done
      </button>
    </footer>
  </>
)

const SummaryRow: FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-black/52">{label}</span>
    <span className={`font-medium tabular-nums ${accent ? 'text-[#00813f]' : 'text-black'}`}>{value}</span>
  </div>
)
