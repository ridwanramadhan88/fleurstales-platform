import type { FC, ReactNode } from 'react'
import { Building2, Check, MapPin } from 'lucide-react'
import type { CartDrawerViewModel } from './CartDrawerController'
import { useCatalogStore } from '../../store/catalogStore'
import { getStorefrontProductThumbnailById } from './storefrontProductImages'
import { formatDisplayDate } from '../ui/date-time-field'
import { DeliveryFillIcon, PickupFillIcon } from './StorefrontFulfilmentIcons'
import { StorefrontCopyButton } from './StorefrontCopyButton'

const voucherInputClass = 'sf-field min-w-0 flex-1 uppercase placeholder:normal-case'

const ReviewSection: FC<{ eyebrow: string; title?: string; children: ReactNode }> = ({ eyebrow, title, children }) => (
  <section>
    <h3 className="checkout-section-title flex flex-wrap items-baseline gap-x-2 font-medium leading-[1.05]">
      <span className="text-[#00813f]">{eyebrow}</span>
      {title && <><span className="text-black/28">·</span><span>{title}</span></>}
    </h3>
    <div className="mt-3.5">{children}</div>
  </section>
)

export const ReviewStep: FC<CartDrawerViewModel> = ({
  lines,
  formatter,
  customerName,
  whatsappNumber,
  email,
  matchedCustomerSegment,
  selectedBranch,
  orderNote,
  greetingMessage,
  greetingCardName,
  fulfillment,
  deliveryDate,
  deliveryTime,
  deliveryAddress,
  itemsTotalIdr,
  deliveryFeeIdr,
  discountIdr,
  grandTotalIdr,
  voucherCode,
  appliedVoucherCode,
  voucherMessage,
  eligibleVouchers,
  matchedCustomer,
  bankAccounts,
  detailsError,
  setVoucherCode,
  setVoucherMessage,
  handleApplyVoucher,
  handleApplySuggestedVoucher,
  handleRemoveVoucher,
  handleConfirmOrder,
  setStep,
}) => {
  const catalogProducts = useCatalogStore((state) => state.products)
  const paymentAccount = bankAccounts.find((account) => account.isDefault) ?? bankAccounts[0]

  return (
    <>
      <div className="storefront-checkout-scroll flex-1 space-y-9 overflow-y-auto px-[18px] pb-8 pt-5 sm:px-7 sm:pt-6 lg:px-8">
        <ReviewSection eyebrow="Customer" title={customerName}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1rem] leading-7 text-black/68">
            <span>{whatsappNumber}</span>
            {email.trim() && <><span aria-hidden="true">·</span><span>{email}</span></>}
            {matchedCustomerSegment && (
              <span className="rounded-full bg-[#00813f] px-2.5 py-1 sf-type-1 font-medium uppercase text-white">
                {matchedCustomerSegment === 'vip' ? 'VIP' : matchedCustomerSegment === 'regular' ? 'Regular' : 'New'}
              </span>
            )}
          </div>
        </ReviewSection>

        <ReviewSection eyebrow="Fulfillment" title={fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}>
          <div className="grid gap-3 sf-type-2 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-[var(--sf-radius-field)] bg-[#f0e6dd] px-4 py-4">
              {fulfillment === 'delivery'
                ? <DeliveryFillIcon className="mt-0.5 size-4 shrink-0 text-[#00813f]" />
                : <PickupFillIcon className="mt-0.5 size-4 shrink-0 text-[#00813f]" />}
              <div>
                <p className="sf-type-3 font-medium leading-[1.1]">{selectedBranch?.name || 'Branch not selected'}</p>
                <p className="mt-1.5 sf-type-2 leading-6 text-black/56">
                  {deliveryDate ? formatDisplayDate(deliveryDate) : 'Date not selected'}{deliveryTime ? ` · ${deliveryTime}` : ''}
                </p>
              </div>
            </div>
            {fulfillment === 'delivery' && (
              <div className="flex items-start gap-3 rounded-[var(--sf-radius-field)] bg-white/55 px-4 py-4">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#00813f]" strokeWidth={1.8} />
                <p className="sf-type-2 leading-6 text-black/66">{deliveryAddress}</p>
              </div>
            )}
          </div>
        </ReviewSection>

        <ReviewSection eyebrow="Items" title={`${lines.length}`}>
          <div className="divide-y divide-black/[0.09]">
            {lines.map((line) => (
              <div key={line.lineId} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3.5 py-4">
                <div className="aspect-[4/5] overflow-hidden bg-[#eee4cc] [clip-path:polygon(0_0,100%_2%,97%_100%,3%_97%)]">
                  <img src={getStorefrontProductThumbnailById(catalogProducts, line.productId)} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[1.3rem] font-medium leading-[1.08]">{line.name}</p>
                  <p className="mt-1.5 sf-type-2 text-black/48">{formatter.format(line.unitPriceIdr)} × {line.quantity}</p>
                </div>
                <p className="sf-type-3 font-medium tabular-nums">{formatter.format(line.unitPriceIdr * line.quantity)}</p>
              </div>
            ))}
          </div>
        </ReviewSection>

        {(greetingMessage.trim() || greetingCardName.trim() || orderNote.trim()) && (
          <ReviewSection eyebrow="Extras" title="Card and notes">
            <div className="space-y-6">
              {(greetingMessage.trim() || greetingCardName.trim()) && (
                <div className="border-l-[3px] border-[#00813f] py-0.5 pl-4">
                  <p className="sf-label text-black/40">Greeting card</p>
                  {greetingMessage.trim() && <p className="mt-2 whitespace-pre-wrap text-[1.3rem] leading-[1.3]">{greetingMessage}</p>}
                  {greetingCardName.trim() && <p className="storefront-card-signature mt-3 sf-type-2 font-medium text-black/52">{greetingCardName}</p>}
                </div>
              )}
              {orderNote.trim() && (
                <div>
                  <p className="sf-label text-black/40">Order note</p>
                  <p className="mt-2 whitespace-pre-wrap sf-type-2 leading-6 text-black/72">{orderNote}</p>
                </div>
              )}
            </div>
          </ReviewSection>
        )}

        <ReviewSection eyebrow="Voucher">
          {!appliedVoucherCode && eligibleVouchers.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Available vouchers">
              {eligibleVouchers.map((voucher) => (
                <button key={voucher.id} type="button" onClick={() => handleApplySuggestedVoucher(voucher.code)} className="min-h-11 rounded-full border border-[#00813f]/28 bg-[#00813f]/[0.055] px-4 sf-type-1 font-medium text-[#00813f] transition hover:bg-[#00813f]/10">
                  {voucher.code} · {voucher.percentOff}% off
                </button>
              ))}
            </div>
          )}
          {appliedVoucherCode ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--sf-radius-field)] border border-[#00813f]/24 bg-[#00813f]/[0.055] px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#00813f] text-white"><Check className="size-3.5" strokeWidth={2.2} /></span>
                <div className="min-w-0"><p className="truncate sf-type-2 font-medium">{appliedVoucherCode}</p><p className="sf-type-1 text-black/45">Voucher applied</p></div>
              </div>
              <button type="button" onClick={handleRemoveVoucher} className="h-11 rounded-full px-3 sf-type-1 font-medium text-black/48 underline underline-offset-4">Remove</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={voucherCode} onChange={(event) => { setVoucherCode(event.target.value); setVoucherMessage(null) }} placeholder="Enter code (optional)" className={voucherInputClass} />
              <button type="button" onClick={handleApplyVoucher} disabled={!voucherCode.trim()} className="min-h-12 rounded-full bg-black px-5 sf-type-2 font-medium text-white transition disabled:opacity-30">Apply</button>
            </div>
          )}
          {matchedCustomer && eligibleVouchers.length > 0 && !appliedVoucherCode && <p className="mt-2 sf-type-1 text-[#00813f]">Available for your customer profile.</p>}
          {voucherMessage && !appliedVoucherCode && <p className="mt-2 sf-type-1 text-red-700">{voucherMessage}</p>}
        </ReviewSection>

        <ReviewSection eyebrow="Payment" title="Bank transfer">
          <div className="flex min-h-[4.75rem] w-full items-center gap-3 rounded-[var(--sf-radius-field)] border border-[#00813f] bg-[#00813f]/[0.055] px-4 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00813f] text-white"><Building2 className="size-[1.05rem]" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1 sf-type-3 font-medium text-black">Bank transfer</span>
            <span className="size-4 shrink-0 rounded-full border-[5px] border-[#00813f]" aria-hidden="true" />
          </div>

          <div className="mt-3 overflow-hidden rounded-[var(--sf-radius-field)] bg-[#f0e6dd]">
            {paymentAccount ? (
              <div className="space-y-3 px-4 py-4">
                <div>
                  <p className="sf-type-2 font-medium">{paymentAccount.bankName || 'Bank'}</p>
                  <p className="mt-1 sf-type-1 text-black/46">a.n. {paymentAccount.accountHolder}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[1.75rem] font-medium leading-none tabular-nums">{paymentAccount.accountNumber}</p>
                  <StorefrontCopyButton value={paymentAccount.accountNumber} label="Copy" />
                </div>
              </div>
            ) : (
              <p className="px-4 py-3.5 sf-type-2 leading-6 text-black/52">No bank account is currently available for this branch.</p>
            )}
          </div>
        </ReviewSection>

        <ReviewSection eyebrow="Order total">
          <div className="space-y-3 rounded-[var(--sf-radius-card)] bg-[#f0e6dd] px-4 py-5">
            <PriceRow label="Subtotal" value={formatter.format(itemsTotalIdr)} />
            <PriceRow label={fulfillment === 'delivery' ? 'Delivery fee' : 'Pickup fee'} value={fulfillment === 'delivery' ? formatter.format(deliveryFeeIdr) : 'Free'} />
            {discountIdr > 0 && <PriceRow label={appliedVoucherCode ? `Discount (${appliedVoucherCode})` : 'Discount'} value={`-${formatter.format(discountIdr)}`} accent />}
            <div className="mt-4 flex items-end justify-between gap-4 border-t border-black/14 pt-4">
              <span className="sf-type-3 font-medium">Total to pay</span>
              <span className="text-[2.55rem] font-medium leading-none tabular-nums">{formatter.format(grandTotalIdr)}</span>
            </div>
          </div>
        </ReviewSection>
      </div>

      <footer className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2.5 border-t border-black/12 bg-[var(--sf-cream)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-5 lg:px-8">
        {detailsError && <p role="alert" className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{detailsError}</p>}
        <button type="button" onClick={() => setStep('details')} className="sf-secondary-action px-5">Back</button>
        <button type="button" onClick={handleConfirmOrder} className="sf-primary-action tap-scale px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0e6dd] sm:px-6">
          Place order · {formatter.format(grandTotalIdr)}
        </button>
      </footer>
    </>
  )
}

const PriceRow: FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex items-center justify-between gap-4 sf-type-2">
    <span className="text-black/56">{label}</span>
    <span className={`font-medium tabular-nums ${accent ? 'text-[#00813f]' : 'text-black'}`}>{value}</span>
  </div>
)
