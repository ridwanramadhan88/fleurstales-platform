import type { FC, ReactNode } from 'react'
import { PackageCheck } from 'lucide-react'
import { DatePickerField, TimeSelectField } from '../ui/date-time-field'
import type { CartDrawerViewModel } from './CartDrawerController'
import { DeliveryFillIcon, PickupFillIcon } from './StorefrontFulfilmentIcons'

const fieldClass = 'sf-field'
const textareaClass = 'sf-field sf-textarea'
const pickerClass = 'sf-field'

const CheckoutSection: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <h3 className="checkout-section-title font-medium leading-[0.96] text-black">{title}</h3>
    <div className="mt-4 space-y-4">{children}</div>
  </section>
)

const Field: FC<{ label: string; required?: boolean; children: ReactNode }> = ({
  label,
  required,
  children,
}) => (
  <div className="space-y-2.5">
    <label className="block sf-type-2 font-medium leading-[1.2] text-black/68">
      {label}
      {required && <span className="ml-0.5 text-[#00813f]">*</span>}
    </label>
    {children}
  </div>
)

export const DetailsStep: FC<CartDrawerViewModel> = ({
  customerName,
  whatsappNumber,
  email,
  birthday,
  showBirthdayField,
  branch,
  activeBranches,
  availableTimeSlots,
  isDateUnavailable,
  fulfillment,
  deliveryDate,
  deliveryTime,
  deliveryAddress,
  orderNote,
  greetingMessage,
  greetingCardName,
  matchedCustomer,
  matchedCustomerSegment,
  detailsError,
  setCustomerName,
  setWhatsappNumber,
  setEmail,
  setBirthday,
  setShowBirthdayField,
  setBranch,
  handleFulfillmentChange,
  setDeliveryDate,
  setDeliveryTime,
  setDeliveryAddress,
  setOrderNote,
  setGreetingMessage,
  setGreetingCardName,
  setStep,
  handleContinueFromDetails,
}) => (
  <>
    <div className="storefront-checkout-form storefront-checkout-scroll flex-1 space-y-10 overflow-y-auto px-[18px] pb-10 pt-5 sm:px-7 sm:pt-6 lg:px-8">
      <CheckoutSection title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Full name"
              className={fieldClass}
            />
          </Field>
          <Field label="WhatsApp" required>
            <input
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              placeholder="08xx-xxxx-xxxx"
              inputMode="tel"
              className={fieldClass}
            />
          </Field>
        </div>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className={fieldClass}
          />
        </Field>

        {whatsappNumber.trim().length > 0 && matchedCustomer && (
          <div className="flex items-center gap-2.5 rounded-[var(--sf-radius-field)] bg-[#00813f]/[0.065] px-3.5 py-3 sf-type-2 text-[#006f36]">
            <PackageCheck className="size-4 shrink-0" strokeWidth={1.45} fill="currentColor" />
            <p className="min-w-0 truncate">
              <span className="font-medium">{matchedCustomer.name}</span>
              <span className="ml-1.5 text-[#006f36]/65">
                {matchedCustomerSegment === 'vip' ? 'VIP' : 'Returning customer'}
              </span>
            </p>
          </div>
        )}

        {!showBirthdayField ? (
          <button
            type="button"
            onClick={() => setShowBirthdayField(true)}
            className="text-left sf-type-2 font-medium text-[#00813f]"
          >
            Add birthday
          </button>
        ) : (
          <Field label="Birthday">
            <DatePickerField value={birthday} onChange={setBirthday} className={pickerClass} />
          </Field>
        )}
      </CheckoutSection>

      <CheckoutSection title="Fulfillment">
        <div className="flex flex-wrap items-center gap-3">
          {([
            {
              id: 'delivery' as const,
              label: 'Delivery',
              Icon: DeliveryFillIcon,
              shapeClass: '[clip-path:polygon(2%_4%,98%_1%,96%_98%,1%_96%)]',
            },
            {
              id: 'pickup' as const,
              label: 'Pickup',
              Icon: PickupFillIcon,
              shapeClass: '[clip-path:polygon(4%_2%,99%_6%,97%_100%,1%_94%)]',
            },
          ]).map(({ id, label, Icon, shapeClass }) => {
            const active = fulfillment === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleFulfillmentChange(id)}
                aria-pressed={active}
                className={`inline-flex min-h-[3.35rem] items-center justify-center gap-2.5 px-5 sf-type-3 font-medium leading-none transition ${shapeClass} ${
                  active
                    ? 'bg-[#00813f] text-white'
                    : 'bg-[#f0e6dd] text-black/72 hover:bg-[#eadfd4]'
                }`}
              >
                <Icon className="size-[1.15rem]" />
                {label}
              </button>
            )
          })}
        </div>

        <Field label="Branch" required>
          <select
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            className={`${fieldClass} sf-branch-select`}
          >
            <option value="" disabled>Select branch</option>
            {activeBranches.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </Field>

        {fulfillment === 'delivery' && (
          <Field label="Delivery address" required>
            <textarea
              value={deliveryAddress}
              onChange={(event) => setDeliveryAddress(event.target.value)}
              placeholder="Street, city, building, and useful landmark"
              className={textareaClass}
            />
          </Field>
        )}
      </CheckoutSection>

      <CheckoutSection title={fulfillment === 'delivery' ? 'Delivery schedule' : 'Pickup schedule'}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={fulfillment === 'delivery' ? 'Delivery date' : 'Pickup date'} required>
            <DatePickerField
              value={deliveryDate}
              onChange={setDeliveryDate}
              placeholder="Pick date"
              disabledDates={isDateUnavailable}
              className={pickerClass}
            />
          </Field>
          <Field label={fulfillment === 'delivery' ? 'Delivery time' : 'Pickup time'} required>
            <TimeSelectField
              value={deliveryTime}
              onChange={setDeliveryTime}
              placeholder="Pick time"
              allowedSlots={availableTimeSlots}
              disabled={!deliveryDate || availableTimeSlots.length === 0}
              className={pickerClass}
            />
          </Field>
        </div>
      </CheckoutSection>

      <CheckoutSection title="Greeting card">
        <Field label="Message">
          <textarea
            id="checkoutGreetingMessage"
            value={greetingMessage}
            onChange={(event) => setGreetingMessage(event.target.value)}
            placeholder="Write your card message"
            className={textareaClass}
            aria-label="Card message"
          />
        </Field>
        <Field label="From">
          <input
            id="checkoutGreetingCardName"
            value={greetingCardName}
            onChange={(event) => setGreetingCardName(event.target.value)}
            placeholder="Name on the card"
            className={fieldClass}
            aria-label="Name on greeting card"
          />
        </Field>
      </CheckoutSection>

      <CheckoutSection title="Order note">
        <Field label="Note or special request">
          <textarea
            id="checkoutOrderNote"
            value={orderNote}
            onChange={(event) => setOrderNote(event.target.value)}
            placeholder="Note or special request for this order"
            className={textareaClass}
            aria-label="Order note"
          />
        </Field>
      </CheckoutSection>

      {detailsError && (
        <div role="alert" className="rounded-[var(--sf-radius-field)] border border-red-500/20 bg-red-500/[0.06] px-4 py-3 sf-type-2 leading-5 text-red-700">
          {detailsError}
        </div>
      )}
    </div>

    <footer className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2.5 border-t border-black/12 bg-[var(--sf-cream)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-5 lg:px-8">
      <button
        type="button"
        onClick={() => setStep('cart')}
        className="sf-secondary-action px-5"
      >
        Back
      </button>
      <button
        type="button"
        onClick={handleContinueFromDetails}
        className="sf-primary-action tap-scale px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sf-cream)]"
      >
        Review order
      </button>
    </footer>
  </>
)
