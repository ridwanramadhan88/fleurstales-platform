import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import { sanitizeCurrency } from '../../lib/formatters'
import type { NewOrderFormValues } from './useNewOrderForm'
import type { Voucher } from '../../store/voucherStore'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import { calculateOrderTotal, validateVoucherCode } from '../../domain/voucherDomain'

export interface CatalogProductOption {
  id: string
  label: string
}

export const useNewOrderPricing = ({
  values,
  catalogProducts,
  vouchers = [],
  voucherCustomer = null,
}: {
  values: NewOrderFormValues
  catalogProducts: CatalogProduct[]
  vouchers?: Voucher[]
  voucherCustomer?: Pick<CustomerProfile, 'id' | 'tags'> | null
}) => {
  const catalogPriceFormatter = new Intl.NumberFormat('id-ID')
  const selectedCatalogProduct =
    values.orderItemMode === 'catalog'
      ? catalogProducts.find(
          (item) => item.id === values.orderItemCatalogId,
        ) ?? null
      : null

  const primaryItemPriceIdr =
    values.orderItemMode === 'catalog'
      ? (selectedCatalogProduct ? getDisplayPriceIdr(selectedCatalogProduct) : 0)
      : sanitizeCurrency(values.orderItemCustomPrice)

  const deliveryFeeValueForReview =
    values.fulfillmentType === 'delivery'
      ? sanitizeCurrency(values.deliveryFee)
      : 0

  const voucherValidation = values.promoCode.trim()
    ? validateVoucherCode(values.promoCode, vouchers, {
        orderSubtotalIdr: primaryItemPriceIdr,
        customer: voucherCustomer,
      })
    : null
  const voucherDiscountIdr =
    voucherValidation?.ok && voucherValidation.discountIdr
      ? voucherValidation.discountIdr
      : 0

  const estimatedOrderTotalIdr = calculateOrderTotal({
    itemsTotalIdr: primaryItemPriceIdr,
    discountIdr: voucherDiscountIdr,
    deliveryFeeIdr: deliveryFeeValueForReview,
  }).grandTotalIdr

  const depositValueForReview =
    values.paymentStatus === 'partial'
      ? sanitizeCurrency(values.depositAmount)
      : 0

  const catalogProductOptions: CatalogProductOption[] = catalogProducts.map((product) => ({
    id: product.id,
    label: `${product.name} · Rp ${catalogPriceFormatter.format(getDisplayPriceIdr(product))}`,
  }))

  return {
    catalogPriceFormatter,
    selectedCatalogProduct,
    estimatedOrderTotalIdr,
    primaryItemPriceIdr,
    voucherDiscountIdr,
    voucherValidation,
    depositValueForReview,
    catalogProductOptions,
  }
}
