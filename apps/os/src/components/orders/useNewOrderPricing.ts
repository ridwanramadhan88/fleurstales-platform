import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import { sanitizeCurrency } from '../../lib/formatters'
import type { NewOrderFormValues } from './useNewOrderForm'
import type { Voucher } from '../../store/voucherStore'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import { calculateOrderTotal, validateVoucherCode } from '../../domain/voucherDomain'
import type { StorefrontCheckoutQuoteResult } from '../../data/shared/contracts'

export interface CatalogProductOption {
  id: string
  label: string
}

export interface CatalogVariantOption {
  id: string
  label: string
}

export const useNewOrderPricing = ({
  values,
  catalogProducts,
  vouchers = [],
  voucherCustomer = null,
  authoritativeDeliveryFeeIdr = 0,
  serverQuote = null,
}: {
  values: NewOrderFormValues
  catalogProducts: CatalogProduct[]
  vouchers?: Voucher[]
  voucherCustomer?: Pick<CustomerProfile, 'id' | 'tags'> | null
  authoritativeDeliveryFeeIdr?: number
  serverQuote?: StorefrontCheckoutQuoteResult | null
}) => {
  const catalogPriceFormatter = new Intl.NumberFormat('id-ID')
  const selectedCatalogProduct =
    values.orderItemMode === 'catalog'
      ? catalogProducts.find(
          (item) => item.id === values.orderItemCatalogId,
        ) ?? null
      : null

  const selectedCatalogVariant = selectedCatalogProduct?.variants.find(
    (variant) => variant.id === values.orderItemVariantId && variant.status === 'active',
  ) ?? null

  const primaryItemPriceIdr =
    values.orderItemMode === 'catalog'
      ? (selectedCatalogVariant?.price ?? (selectedCatalogProduct ? getDisplayPriceIdr(selectedCatalogProduct) : 0))
      : sanitizeCurrency(values.orderItemCustomPrice)

  const deliveryFeeValueForReview =
    values.fulfillmentType === 'delivery'
      ? Math.max(0, Math.round(authoritativeDeliveryFeeIdr))
      : 0

  const voucherValidation = values.promoCode.trim()
    ? validateVoucherCode(values.promoCode, vouchers, {
        orderSubtotalIdr: primaryItemPriceIdr,
        customer: voucherCustomer,
      })
    : null
  const voucherDiscountIdr = serverQuote?.discountIdr ?? (
    voucherValidation?.ok && voucherValidation.discountIdr
      ? voucherValidation.discountIdr
      : 0
  )

  const estimatedOrderTotalIdr = serverQuote?.totalIdr ?? calculateOrderTotal({
    itemsTotalIdr: primaryItemPriceIdr,
    discountIdr: voucherDiscountIdr,
    deliveryFeeIdr: serverQuote?.deliveryFeeIdr ?? deliveryFeeValueForReview,
  }).grandTotalIdr

  const depositValueForReview =
    values.paymentStatus === 'partial'
      ? sanitizeCurrency(values.depositAmount)
      : 0

  const catalogProductOptions: CatalogProductOption[] = catalogProducts.map((product) => ({
    id: product.id,
    label: `${product.name} · Rp ${catalogPriceFormatter.format(getDisplayPriceIdr(product))}`,
  }))
  const catalogVariantOptions: CatalogVariantOption[] = (selectedCatalogProduct?.variants ?? [])
    .filter((variant) => variant.status === 'active')
    .map((variant) => ({
      id: variant.id,
      label: `${variant.size || variant.sku} · Rp ${catalogPriceFormatter.format(variant.price)}`,
    }))

  return {
    catalogPriceFormatter,
    selectedCatalogProduct,
    selectedCatalogVariant,
    estimatedOrderTotalIdr,
    primaryItemPriceIdr,
    voucherDiscountIdr,
    voucherValidation,
    depositValueForReview,
    catalogProductOptions,
    catalogVariantOptions,
  }
}
