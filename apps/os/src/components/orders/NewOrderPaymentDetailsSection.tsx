import { useEffect, type FC } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'
import { isCashAllowedForFulfillment } from '../../domain/orderPaymentGateDomain'

interface NewOrderPaymentDetailsSectionProps {
  viewModel: NewOrderSheetViewModel
  fieldClass: (isActive: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderPaymentDetailsSection: FC<NewOrderPaymentDetailsSectionProps> = ({
  viewModel,
  fieldClass,
  sectionClass,
}) => {
  const {
    values,
    errors,
    activeGuideField,
    activeGuideSection,
    onPaymentMethodChange,
    onPaymentStatusChange,
    onFieldValueChange,
    onSectionFocus,
  } = viewModel

  // Partial/deposit payment remains readable in legacy order types, but new
  // Admin-created orders always start unpaid. Full payment is verified during
  // Process Order immediately before production starts.
  useEffect(() => {
    if (values.paymentStatus !== 'unpaid') onPaymentStatusChange('unpaid')
    if (values.depositAmount) onFieldValueChange('depositAmount', '')
  }, [onFieldValueChange, onPaymentStatusChange, values.depositAmount, values.paymentStatus])

  return (
    <section
      onFocus={() => onSectionFocus('payment')}
      className={sectionClass(
        activeGuideSection === 'payment',
        'space-y-3 rounded-lg bg-muted/40 px-3 py-3',
      )}
    >
      <h3 className="text-sm font-semibold leading-5 text-foreground">Payment</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="paymentMethod" className="text-xs font-medium text-muted-foreground">Payment method</label>
          <Select
            value={values.paymentMethod}
            disabled={values.fulfillmentType === 'delivery'}
            onValueChange={(value) => onPaymentMethodChange(value as 'cash' | 'transfer')}
          >
            <SelectTrigger id="paymentMethod" className={fieldClass(activeGuideField === 'paymentMethod')}>
              <SelectValue placeholder="Choose method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash" disabled={!isCashAllowedForFulfillment(values.fulfillmentType || 'pickup')}>Cash</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          {values.fulfillmentType === 'delivery' && <p className="text-2xs text-muted-foreground">Delivery orders are bank transfer only.</p>}
          {errors.paymentMethod && <p className="text-xs text-destructive">{errors.paymentMethod}</p>}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Payment status</span>
          <div className="flex h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium">Unpaid</div>
          <p className="text-2xs text-muted-foreground">Confirm the full payment when you Process Order before production starts.</p>
        </div>
      </div>
    </section>
  )
}
