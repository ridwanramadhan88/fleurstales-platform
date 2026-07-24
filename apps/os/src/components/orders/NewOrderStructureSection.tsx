import type { FC } from 'react'
import { DatePickerField, TimeSelectField } from '../ui/date-time-field'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'

/**
 * @description "Order structure" card of the New Order sheet: fulfillment
 * type (pickup/delivery), order source, and the fulfillment-specific fields
 * (delivery address/fee/instructions, or pickup date/time). Split out of
 * `NewOrderPaymentSection.tsx` — this section makes its own decisions about
 * which fields to show based on `fulfillmentType`, independent of the
 * greeting-card/payment/notes sections.
 */

interface NewOrderStructureSectionProps {
  viewModel: NewOrderSheetViewModel
  fieldClass: (isActive: boolean) => string
  textAreaClass: (isActive: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderStructureSection: FC<NewOrderStructureSectionProps> = ({
  viewModel,
  fieldClass,
  textAreaClass,
  sectionClass,
}) => {
  const {
    values,
    errors,
    activeGuideField,
    activeGuideSection,
    onFieldChange,
    onFieldValueChange,
    onCurrencyFieldChange,
    onFulfillmentChange,
    onOrderTypeChange,
    onSectionFocus,
    deliveryTimeSlots,
    pickupTimeSlots,
    deliveryHoursLabel,
    pickupHoursLabel,
    isBranchClosedOnDate,
  } = viewModel

  return (
    <section
      onFocus={() => onSectionFocus('structure')}
      className={sectionClass(
        activeGuideSection === 'structure',
        'space-y-3 rounded-lg bg-surface-panel px-3 py-3',
      )}
    >
      <h3 className="text-sm font-semibold leading-5 text-foreground">Order structure</h3>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-medium text-foreground">Order source</span>
          <div
            className={[
              'inline-flex rounded-full border bg-background p-0.5 text-xs transition',
              activeGuideField === 'orderType'
                ? 'border-primary/40 ring-2 ring-primary/40'
                : 'border-border/60',
            ].join(' ')}
          >
            <button
              id="orderType"
              data-guide-field="orderType"
              type="button"
              onClick={() => onOrderTypeChange('admin_created')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition cursor-pointer ${
                values.orderType === 'admin_created'
                  ? 'bg-primary text-primary-foreground shadow-ios-sm'
                  : 'text-muted-foreground hover:text-foreground/90'
              }`}
            >
              Whatsapp
            </button>
            <button
              data-guide-field="orderType"
              type="button"
              onClick={() => onOrderTypeChange('walk_in')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition cursor-pointer ${
                values.orderType === 'walk_in'
                  ? 'bg-primary text-primary-foreground shadow-ios-sm'
                  : 'text-muted-foreground hover:text-foreground/90'
              }`}
            >
              Walk-in
            </button>
          </div>
        </div>
        {errors.orderType && (
          <p className="text-xs text-destructive">{errors.orderType}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-medium text-foreground">Fulfillment</span>
          <div
            className={[
              'inline-flex rounded-full border bg-background p-0.5 text-xs transition',
              activeGuideField === 'fulfillmentType'
                ? 'border-primary/40 ring-2 ring-primary/40'
                : 'border-border',
            ].join(' ')}
          >
            <button
              id="fulfillmentType"
              data-guide-field="fulfillmentType"
              type="button"
              onClick={() => onFulfillmentChange('pickup')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition cursor-pointer ${
                values.fulfillmentType === 'pickup'
                  ? 'bg-primary text-primary-foreground shadow-ios-sm'
                  : 'text-muted-foreground hover:text-foreground/90'
              }`}
            >
              Pickup
            </button>
            <button
              data-guide-field="fulfillmentType"
              type="button"
              onClick={() => onFulfillmentChange('delivery')}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition cursor-pointer ${
                values.fulfillmentType === 'delivery'
                  ? 'bg-primary text-primary-foreground shadow-ios-sm'
                  : 'text-muted-foreground hover:text-foreground/90'
              }`}
            >
              Delivery
            </button>
          </div>
        </div>
        {errors.fulfillmentType && (
          <p className="text-xs text-destructive">{errors.fulfillmentType}</p>
        )}
      </div>
      {values.fulfillmentType === 'delivery' && (
        <>
          <div className="space-y-1.5">
            <label
              htmlFor="deliveryAddress"
              className="text-xs font-medium text-muted-foreground"
            >
              Delivery address
            </label>
            <textarea
              id="deliveryAddress"
              value={values.deliveryAddress}
              onChange={onFieldChange('deliveryAddress')}
              className={textAreaClass(activeGuideField === 'deliveryAddress')}
              placeholder="Street, area, and any key landmark."
            />
            {errors.deliveryAddress && (
              <p className="text-xs text-destructive">{errors.deliveryAddress}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label
                htmlFor="deliveryDate"
                className="text-xs font-medium text-muted-foreground"
              >
                Delivery date
              </label>
              <DatePickerField
                id="deliveryDate"
                value={values.deliveryDate}
                onChange={(value) => onFieldValueChange('deliveryDate', value)}
                placeholder="Pick date"
                disabledDates={isBranchClosedOnDate}
                className={`h-9 text-xs ${fieldClass(activeGuideField === 'deliveryDate')}`}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="deliveryTime"
                className="text-xs font-medium text-muted-foreground"
              >
                Delivery time
              </label>
              <TimeSelectField
                id="deliveryTime"
                value={values.deliveryTime}
                onChange={(value) => onFieldValueChange('deliveryTime', value)}
                placeholder="Pick time"
                allowedSlots={deliveryTimeSlots}
                disabled={!values.deliveryDate || deliveryTimeSlots.length === 0}
                className={`h-9 text-xs ${fieldClass(activeGuideField === 'deliveryTime')}`}
              />
            </div>
          </div>
          <p className={`text-2xs ${deliveryTimeSlots.length === 0 && values.deliveryDate ? 'text-destructive' : 'text-muted-foreground'}`}>
            {deliveryHoursLabel}
          </p>
          {(errors.deliveryDate || errors.deliveryTime) && (
            <p className="text-xs text-destructive">{errors.deliveryDate ?? errors.deliveryTime}</p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="deliveryFee"
                className="text-xs font-medium text-muted-foreground"
              >
                Delivery fee (IDR)
              </label>
              <input
                id="deliveryFee"
                type="text"
                inputMode="numeric"
                value={values.deliveryFee}
                onChange={(event) =>
                  onCurrencyFieldChange('deliveryFee', event.target.value)
                }
                className={fieldClass(activeGuideField === 'deliveryFee')}
                placeholder="e.g. 15000"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="deliveryInstructions"
                className="text-xs font-medium text-muted-foreground"
              >
                Delivery instructions
              </label>
              <input
                id="deliveryInstructions"
                type="text"
                value={values.deliveryInstructions}
                onChange={onFieldChange('deliveryInstructions')}
                className={fieldClass(activeGuideField === 'deliveryInstructions')}
                placeholder="e.g. Call on arrival, gate on the left."
              />
            </div>
          </div>
        </>
      )}
      {values.fulfillmentType === 'pickup' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label
              htmlFor="pickupDate"
              className="text-xs font-medium text-muted-foreground"
            >
              Pickup date
            </label>
            <DatePickerField
              id="pickupDate"
              value={values.pickupDate}
              onChange={(value) => onFieldValueChange('pickupDate', value)}
              placeholder="Pick date"
              disabledDates={isBranchClosedOnDate}
              className={`h-9 text-xs ${fieldClass(activeGuideField === 'pickupDate')}`}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pickupTime"
              className="text-xs font-medium text-muted-foreground"
            >
              Pickup time
            </label>
            <TimeSelectField
              id="pickupTime"
              value={values.pickupTime}
              onChange={(value) => onFieldValueChange('pickupTime', value)}
              placeholder="Pick time"
              allowedSlots={pickupTimeSlots}
              disabled={!values.pickupDate || pickupTimeSlots.length === 0}
              className={`h-9 text-xs ${fieldClass(activeGuideField === 'pickupTime')}`}
            />
          </div>
        </div>
      )}
      {values.fulfillmentType === 'pickup' && (
        <>
          <p className={`text-2xs ${pickupTimeSlots.length === 0 && values.pickupDate ? 'text-destructive' : 'text-muted-foreground'}`}>
            {pickupHoursLabel}
          </p>
          {(errors.pickupDate || errors.pickupTime) && (
            <p className="text-xs text-destructive">{errors.pickupDate ?? errors.pickupTime}</p>
          )}
        </>
      )}
    </section>
  )
}
