import type { FC } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'
import { isCashAllowedForFulfillment } from '../../domain/orderPaymentGateDomain'

/**
 * @description "Payment" card of the New Order sheet: payment method,
 * payment status, and (when partially paid) the deposit amount. Split out of
 * `NewOrderPaymentSection.tsx`.
 */

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
    onCurrencyFieldChange,
    onPaymentMethodChange,
    onPaymentStatusChange,
    onSectionFocus,
  } = viewModel

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
          <label htmlFor="paymentMethod" className="text-xs font-medium text-muted-foreground">
            Payment method
          </label>
          <Select
            value={values.paymentMethod}
            disabled={values.fulfillmentType === 'delivery'}
            onValueChange={(value) => onPaymentMethodChange(value as 'cash' | 'transfer')}
          >
            <SelectTrigger
              id="paymentMethod"
              className={fieldClass(activeGuideField === 'paymentMethod')}
            >
              <SelectValue placeholder="Choose method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value="cash"
                disabled={!isCashAllowedForFulfillment(values.fulfillmentType || 'pickup')}
              >
                Cash
              </SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          {values.fulfillmentType === 'delivery' && (
            <p className="text-2xs text-muted-foreground">
              Delivery orders are bank transfer only.
            </p>
          )}
          {errors.paymentMethod && (
            <p className="text-xs text-destructive">{errors.paymentMethod}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="paymentStatus" className="text-xs font-medium text-muted-foreground">
            Payment status
          </label>
          <Select
            value={values.paymentStatus}
            onValueChange={(value) =>
              onPaymentStatusChange(value as 'unpaid' | 'partial' | 'paid')
            }
          >
            <SelectTrigger
              id="paymentStatus"
              className={fieldClass(activeGuideField === 'paymentStatus')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {values.paymentStatus === 'partial' && (
        <div className="space-y-1.5">
          <label htmlFor="depositAmount" className="text-xs font-medium text-muted-foreground">
            Deposit amount (IDR)
          </label>
          <input
            id="depositAmount"
            type="text"
            inputMode="numeric"
            value={values.depositAmount}
            onChange={(event) => onCurrencyFieldChange('depositAmount', event.target.value)}
            className={fieldClass(activeGuideField === 'depositAmount')}
            placeholder="e.g. 200000"
          />
          {errors.depositAmount && (
            <p className="text-xs text-destructive">{errors.depositAmount}</p>
          )}
        </div>
      )}
    </section>
  )
}
