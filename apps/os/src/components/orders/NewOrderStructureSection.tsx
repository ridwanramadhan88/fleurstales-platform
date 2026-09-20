import { useEffect, type FC } from 'react'
import { DatePickerField, TimeSelectField } from '../ui/date-time-field'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'
import { useOrderSlotAvailability } from '../../hooks/useOrderSlotAvailability'

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

const AvailableTimeField: FC<{
  id: string
  branchId: string
  date: string
  openingSlots: string[]
  value: string
  onChange: (value: string) => void
  className: string
}> = ({ id, branchId, date, openingSlots, value, onChange, className }) => {
  const { availableSlots, loading, error } = useOrderSlotAvailability({ branchId, date, openingSlots })

  useEffect(() => {
    if (!loading && value && !availableSlots.includes(value)) onChange('')
  }, [availableSlots, loading, onChange, value])

  return (
    <>
      <TimeSelectField
        id={id}
        value={value}
        onChange={onChange}
        placeholder={loading ? 'Checking…' : 'Pick time'}
        allowedSlots={availableSlots}
        disabled={!date || loading || availableSlots.length === 0}
        className={className}
      />
      {error && <p className="text-2xs text-destructive">{error}</p>}
    </>
  )
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
    onFulfillmentChange,
    onOrderTypeChange,
    onSectionFocus,
    branchLabel,
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
        'space-y-3 px-1 py-1',
      )}
    >
      <h3 className="text-sm font-semibold leading-5 text-foreground">Order structure</h3>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-24 shrink-0 text-xs font-medium text-foreground">Order source</span>
          <div
            role="group"
            aria-label="Order source"
            aria-invalid={Boolean(errors.orderType)}
            aria-describedby={errors.orderType ? 'orderType-error' : undefined}
            className={[
              'inline-flex rounded-full border bg-surface-panel p-0.5 text-xs transition',
              errors.orderType
                ? 'border-destructive/50 ring-2 ring-destructive/25'
                : activeGuideField === 'orderType'
                  ? 'border-primary/40 ring-2 ring-primary/40'
                  : 'border-border/60',
            ].join(' ')}
          >
            <button
              id="orderType"
              data-guide-field="orderType"
              type="button"
              onClick={() => onOrderTypeChange('admin_created')}
              className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 font-medium transition cursor-pointer ${
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
              className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 font-medium transition cursor-pointer ${
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
          <p id="orderType-error" className="text-xs text-destructive" role="alert">{errors.orderType}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-24 shrink-0 text-xs font-medium text-foreground">Fulfillment</span>
          <div
            role="group"
            aria-label="Fulfillment"
            aria-invalid={Boolean(errors.fulfillmentType)}
            aria-describedby={errors.fulfillmentType ? 'fulfillmentType-error' : undefined}
            className={[
              'inline-flex rounded-full border bg-surface-panel p-0.5 text-xs transition',
              errors.fulfillmentType
                ? 'border-destructive/50 ring-2 ring-destructive/25'
                : activeGuideField === 'fulfillmentType'
                  ? 'border-primary/40 ring-2 ring-primary/40'
                  : 'border-border',
            ].join(' ')}
          >
            <button
              id="fulfillmentType"
              data-guide-field="fulfillmentType"
              type="button"
              onClick={() => onFulfillmentChange('pickup')}
              className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 font-medium transition cursor-pointer ${
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
              className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 font-medium transition cursor-pointer ${
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
          <p id="fulfillmentType-error" className="text-xs text-destructive" role="alert">{errors.fulfillmentType}</p>
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
              autoComplete="street-address"
              className={textAreaClass(activeGuideField === 'deliveryAddress') + (errors.deliveryAddress ? ' border-destructive ring-destructive/25' : '')}
              placeholder="Street, area, and any key landmark."
              aria-invalid={Boolean(errors.deliveryAddress)}
              aria-describedby={errors.deliveryAddress ? 'deliveryAddress-error' : undefined}
            />
            {errors.deliveryAddress && (
              <p id="deliveryAddress-error" className="text-xs text-destructive" role="alert">{errors.deliveryAddress}</p>
            )}
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
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
                className={`h-11 text-sm ${fieldClass(activeGuideField === 'deliveryDate')}${errors.deliveryDate ? ' border-destructive ring-destructive/25' : ''}`}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="deliveryTime"
                className="text-xs font-medium text-muted-foreground"
              >
                Delivery time
              </label>
              <AvailableTimeField
                id="deliveryTime"
                branchId={branchLabel}
                date={values.deliveryDate}
                openingSlots={deliveryTimeSlots}
                value={values.deliveryTime}
                onChange={(value) => onFieldValueChange('deliveryTime', value)}
                className={`h-11 text-sm ${fieldClass(activeGuideField === 'deliveryTime')}${errors.deliveryTime ? ' border-destructive ring-destructive/25' : ''}`}
              />
            </div>
          </div>
          <p className={`text-2xs ${deliveryTimeSlots.length === 0 && values.deliveryDate ? 'text-destructive' : 'text-muted-foreground'}`}>
            {deliveryHoursLabel}
          </p>
          {(errors.deliveryDate || errors.deliveryTime) && (
            <p id={errors.deliveryDate ? 'deliveryDate-error' : 'deliveryTime-error'} className="text-xs text-destructive" role="alert">{errors.deliveryDate ?? errors.deliveryTime}</p>
          )}

          <div className="grid gap-2 lg:grid-cols-2">
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
                readOnly
                aria-readonly="true"
                className={`${fieldClass(false)} cursor-not-allowed bg-muted/40`}
                placeholder="Configured branch fee"
              />
              <p className="text-2xs text-muted-foreground">Set in Store Settings for this branch.</p>
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
                enterKeyHint="next"
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
              className={`h-11 text-sm ${fieldClass(activeGuideField === 'pickupDate')}${errors.pickupDate ? ' border-destructive ring-destructive/25' : ''}`}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pickupTime"
              className="text-xs font-medium text-muted-foreground"
            >
              Pickup time
            </label>
            <AvailableTimeField
              id="pickupTime"
              branchId={branchLabel}
              date={values.pickupDate}
              openingSlots={pickupTimeSlots}
              value={values.pickupTime}
              onChange={(value) => onFieldValueChange('pickupTime', value)}
              className={`h-11 text-sm ${fieldClass(activeGuideField === 'pickupTime')}${errors.pickupTime ? ' border-destructive ring-destructive/25' : ''}`}
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
            <p id={errors.pickupDate ? 'pickupDate-error' : 'pickupTime-error'} className="text-xs text-destructive" role="alert">{errors.pickupDate ?? errors.pickupTime}</p>
          )}
        </>
      )}
    </section>
  )
}
